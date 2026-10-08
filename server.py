#!/usr/bin/env python3
"""
本地服务管控台

架构：
- config/services.json 服务的单一事实源（面板、start-all/stop-all/status 脚本共用）
- static/ + templates/ 前端静态文件，改样式无需重启本进程
- /status 并行检查所有服务状态并缓存，多浏览器轮询共享结果
"""

import json
import os
import subprocess
import sys
import threading
import time
import signal
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

PROJECT_ROOT = Path(__file__).parent
CONFIG_FILE = PROJECT_ROOT / "config" / "services.json"
STATIC_DIR = PROJECT_ROOT / "static"
TEMPLATES_DIR = PROJECT_ROOT / "templates"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
LOGS_DIR = PROJECT_ROOT / "logs"

STATUS_TTL_SECONDS = 5          # /status 结果缓存，多客户端轮询共享
STATUS_CHECK_WORKERS = 8        # 并行执行 status_cmd 的子进程数
LOG_TAIL_BYTES = 64 * 1024      # 读日志只取文件尾部，避免大文件全量读


class ConfigStore:
    """加载 services.json，文件变更后自动重载（改配置无需重启面板）"""

    def __init__(self, path):
        self.path = path
        self._data = None
        self._mtime = None
        self._lock = threading.Lock()

    def load(self):
        with self._lock:
            mtime = self.path.stat().st_mtime
            if self._data is None or mtime != self._mtime:
                self._data = json.loads(self.path.read_text(encoding="utf-8"))
                self._mtime = mtime
            return self._data

    def services(self):
        return self.load()["services"]

    def service(self, service_id):
        for svc in self.services():
            if svc["id"] == service_id:
                return svc
        return None


CONFIG = ConfigStore(CONFIG_FILE)


def substitute_placeholders(text, service):
    """展开启动命令中的路径占位符"""
    return (text
            .replace("{project_root}", str(PROJECT_ROOT))
            .replace("{logs_dir}", str(LOGS_DIR))
            .replace("{log_file}", str(LOGS_DIR / service.get("log_file", "service.log"))))


# 毒化变量：面板往往从带临时代理 / WorkBuddy shim 的终端启动，
# 直接继承会让 frpc 走死代理导致隧道全断，node dev server 被 broker shim 崩掉
POISON_ENV_KEYS = (
    "http_proxy", "https_proxy", "all_proxy",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
)
POISON_NODE_OPTIONS_MARKERS = ("WorkBuddy", "brokered", "shim")


def child_env():
    """给子进程用的净化环境：剔除临时代理与 WorkBuddy NODE_OPTIONS 注入"""
    env = os.environ.copy()
    for key in POISON_ENV_KEYS:
        env.pop(key, None)
    node_options = env.get("NODE_OPTIONS", "")
    if any(marker in node_options for marker in POISON_NODE_OPTIONS_MARKERS):
        env.pop("NODE_OPTIONS", None)
    return env


def port_listening(port):
    if not port:
        return False
    result = subprocess.run(
        f"lsof -i :{port} -sTCP:LISTEN", shell=True, capture_output=True
    )
    return result.returncode == 0


class ServiceManager:
    def __init__(self):
        self._status_cache = None
        self._status_ts = 0.0
        self._lock = threading.Lock()

    def check_service(self, service):
        """检查单个服务：status_cmd 判定进程，port 监听作为兜底"""
        try:
            result = subprocess.run(
                service["status_cmd"], shell=True, capture_output=True, text=True
            )
            running = result.returncode == 0

            listening = None
            if service.get("port"):
                listening = port_listening(service["port"])
                # ps grep patterns are brittle (e.g. dev servers spawned without "npm"
                # in their command line), so trust an actual listening port as well
                running = running or listening

            return {
                "running": running,
                "port_listening": listening,
                "port": service.get("port"),
                "type": service.get("type"),
            }
        except Exception as e:
            return {
                "running": False,
                "port_listening": False,
                "port": service.get("port"),
                "type": service.get("type"),
                "error": str(e),
            }

    def get_all_status(self):
        with self._lock:
            if self._status_cache and time.time() - self._status_ts < STATUS_TTL_SECONDS:
                return self._status_cache
            services = CONFIG.services()
            with ThreadPoolExecutor(max_workers=STATUS_CHECK_WORKERS) as pool:
                results = pool.map(self.check_service, services)
            status = {svc["id"]: result for svc, result in zip(services, results)}
            self._status_cache = status
            self._status_ts = time.time()
            return status

    def get_log_content(self, service_id, lines=100):
        service = CONFIG.service(service_id)
        if not service:
            return "❌ 服务不存在"
        log_file = LOGS_DIR / service["log_file"]
        if not log_file.exists():
            return "📄 日志文件不存在"
        try:
            with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                f.seek(max(0, size - LOG_TAIL_BYTES))
                content = f.read()
            line_list = content.strip().split("\n")[-lines:]
            return "\n".join(line_list) if line_list else "📄 暂无日志内容"
        except Exception as e:
            return f"❌ 读取日志失败: {e}"

    def start_service(self, service_id):
        """按 services.json 的 start 配置后台启动服务"""
        service = CONFIG.service(service_id)
        if not service:
            return False, f"服务不存在: {service_id}"
        start = service.get("start")
        if not start:
            return False, f"{service['name']} 没有配置启动命令"

        if service.get("port") and port_listening(service["port"]):
            return True, f"{service['name']} 已在运行中 (端口 {service['port']})"

        work_dir = substitute_placeholders(start["dir"], service)
        if not Path(work_dir).is_dir():
            return False, f"目录不存在: {work_dir}"

        log_file = LOGS_DIR / service["log_file"]
        LOGS_DIR.mkdir(exist_ok=True)
        cmd = substitute_placeholders(start["cmd"], service)
        try:
            with open(log_file, "a", encoding="utf-8") as out:
                process = subprocess.Popen(
                    ["bash", "-c", cmd],
                    cwd=work_dir,
                    env=child_env(),
                    stdout=out,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
        except Exception as e:
            return False, f"启动失败: {e}"
        return True, f"{service['name']} 启动中 (PID {process.pid})，日志: logs/{service['log_file']}"

    def stop_service(self, service_id):
        """停止服务：优先显式 stop 配置，其次按端口，面板自身拒绝停止"""
        service = CONFIG.service(service_id)
        if not service:
            return False, f"服务不存在: {service_id}"
        if service.get("self"):
            return False, "面板不能停止自己；如需停止请在终端执行: ./scripts/stop-all.sh --panel"

        name = service["name"]
        stop = service.get("stop")
        if stop:
            if stop["mode"] == "cmd":
                result = subprocess.run(
                    ["bash", "-c", substitute_placeholders(stop["value"], service)],
                    env=child_env(),
                    capture_output=True, text=True,
                )
                return result.returncode == 0, f"{name} 停止命令已执行" + ("" if result.returncode == 0 else f": {result.stderr.strip()}")
            if stop["mode"] == "pattern":
                return self._kill_by_pattern(name, stop["value"])

        if service.get("port"):
            return self._kill_by_port(name, service["port"])
        return False, f"{name} 没有配置停止方式"

    def _kill_by_pattern(self, name, pattern):
        pids = subprocess.run(
            f"ps aux | grep '{pattern}' | grep -v grep | awk '{{print $2}}'",
            shell=True, capture_output=True, text=True,
        ).stdout.split()
        if not pids:
            return True, f"{name} 未在运行"
        for pid in pids:
            subprocess.run(["kill", pid], capture_output=True)
        time.sleep(2)
        for pid in pids:  # 仍存活则强杀
            subprocess.run(
                f"kill -0 {pid} 2>/dev/null && kill -9 {pid}", shell=True, capture_output=True
            )
        return True, f"{name} 已停止 (PID {', '.join(pids)})"

    def _kill_by_port(self, name, port):
        if not port_listening(port):
            return True, f"{name} 未在运行"
        pids = subprocess.run(
            f"lsof -ti :{port}", shell=True, capture_output=True, text=True
        ).stdout.split()
        for pid in pids:
            subprocess.run(["kill", pid], capture_output=True)
        for _ in range(10):  # 最多等 5 秒优雅退出
            if not port_listening(port):
                return True, f"{name} 已停止 (端口 {port})"
            time.sleep(0.5)
        for pid in pids:
            subprocess.run(["kill", "-9", pid], capture_output=True)
        return True, f"{name} 已强制停止 (端口 {port})"

    def execute_script(self, script_name):
        script_path = SCRIPTS_DIR / script_name
        if not script_path.exists():
            return False, f"脚本不存在: {script_name}"
        try:
            result = subprocess.run(
                ["bash", str(script_path)],
                cwd=PROJECT_ROOT,
                env=child_env(),
                capture_output=True,
                text=True,
            )
            return result.returncode == 0, result.stdout + result.stderr
        except Exception as e:
            return False, str(e)


MANAGER = ServiceManager()

CONTENT_TYPES = {".css": "text/css", ".js": "application/javascript", ".html": "text/html; charset=utf-8"}


class WebHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # 轮询请求频繁，静默访问日志

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            self._send_file(TEMPLATES_DIR / "index.html")
        elif path == "/api/config":
            self._send_json(self._api_config())
        elif path == "/status":
            self._send_json(MANAGER.get_all_status())
        elif path == "/logs":
            self._send_logs()
        elif path.startswith("/static/"):
            # basename 防路径穿越
            self._send_file(STATIC_DIR / os.path.basename(path[len("/static/"):]))
        else:
            self._send_404()

    def do_POST(self):
        path = urlparse(self.path).path
        if path in ("/execute", "/start", "/stop"):
            self._handle_action(path)
        else:
            self._send_404()

    def _api_config(self):
        cfg = CONFIG.load()
        services = []
        for svc in cfg["services"]:
            services.append({
                "id": svc["id"],
                "name": svc["name"],
                "type": svc["type"],
                "group": svc["group"],
                "port": svc.get("port"),
                "url": svc.get("url"),
                "can_start": bool(svc.get("start") or svc.get("terminal_script")),
                "can_stop": (bool(svc.get("stop")) or bool(svc.get("port"))) and not svc.get("self"),
                "terminal_script": svc.get("terminal_script"),
            })
        return {
            "groups": cfg["groups"],
            "type_labels": cfg["type_labels"],
            "services": services,
        }

    def _handle_action(self, path):
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._send_json({"success": False, "message": "请求体不是合法 JSON"}, 400)
            return

        if path == "/execute":
            script = data.get("script", "")
            if not script:
                self._send_json({"success": False, "message": "未指定脚本"})
                return
            ok, message = MANAGER.execute_script(script)
        elif path == "/start":
            ok, message = MANAGER.start_service(data.get("service", ""))
        else:
            ok, message = MANAGER.stop_service(data.get("service", ""))

        self._send_json({"success": ok, "message": message})

    def _send_logs(self):
        params = parse_qs(urlparse(self.path).query)
        service_id = params.get("service", [""])[0]
        service = CONFIG.service(service_id)
        if not service:
            self._send_json({"error": "服务不存在"})
            return
        self._send_json({
            "log_content": MANAGER.get_log_content(service_id),
            "service_name": service["name"],
        })

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _send_file(self, file_path):
        if not file_path.is_file():
            self._send_404()
            return
        content_type = CONTENT_TYPES.get(file_path.suffix, "application/octet-stream")
        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _send_404(self):
        self.send_response(404)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"404 Not Found")


def run_server(port=8090):
    try:
        server = ThreadingHTTPServer(("localhost", port), WebHandler)
        print(f"🚀 Web管理界面启动在 http://localhost:{port}")
        print(f"📋 服务清单: {CONFIG_FILE}")
        print(f"💡 提示: 按 Ctrl+C 停止服务器；改 services.json / static / 模板后刷新页面即生效")

        def signal_handler(sig, frame):
            print("\n🛑 服务器正在停止...")
            server.shutdown()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        server.serve_forever()
    except Exception as e:
        print(f"❌ 服务器启动失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    run_server(port)
