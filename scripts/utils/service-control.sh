#!/bin/bash
# 🔧 服务控制共享函数库
# 被 start-all.sh / stop-all.sh / status.sh / start-service.sh / stop-service.sh 引用
# 服务数据统一来自 config/services.json（环境变量 PROJECT_LAUNCHER_CONFIG 可覆盖，供测试）

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." && pwd)
LOGS_DIR="$PROJECT_ROOT/logs"
CONFIG_FILE="${PROJECT_LAUNCHER_CONFIG:-$PROJECT_ROOT/config/services.json}"

# 面板 /execute 调起时继承的 PATH 可能缺少用户级安装目录（hermes、npm、brew 等）
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# 毒化变量净化：start-all 常从带临时代理 / WorkBuddy shim 的终端执行，
# 直接继承会让 frpc 走死代理导致隧道全断，node dev server 被 broker shim 崩掉
sanitize_env() {
    unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
    if [ -n "${NODE_OPTIONS:-}" ] \
        && { case "$NODE_OPTIONS" in *WorkBuddy*|*brokered*|*shim*) true ;; *) false ;; esac; }; then
        unset NODE_OPTIONS
    fi
}
sanitize_env

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

port_busy() { lsof -i :"$1" -sTCP:LISTEN >/dev/null 2>&1; }

wait_for_port() {
    local port=$1 max=$2 i=0
    while [ "$i" -lt "$max" ]; do
        port_busy "$port" && return 0
        sleep 1
        i=$((i + 1))
    done
    return 1
}

wait_port_free() {
    local port=$1 max=$2 i=0
    while [ "$i" -lt "$max" ]; do
        port_busy "$port" || return 0
        sleep 1
        i=$((i + 1))
    done
    return 1
}

# svc_query <purpose> [service_id]
# 从 services.json 生成 TSV（制表符分隔），并展开 {project_root} {logs_dir} {log_file} 占位符
# purpose:
#   start-order          → id name dir cmd log_path port status_cmd（按 autostart_order，仅含可启动服务）
#   one-start <id>       → 同上，单个服务
#   stop-order           → id name is_self mode value（工具类先行，其余按 autostart 逆序）
#   one-stop <id>        → 同上，单个服务
#   status               → id name port url status_cmd
svc_query() {
    local purpose=$1
    python3 - "$purpose" "$CONFIG_FILE" "$PROJECT_ROOT" "${2:-}" <<'PY'
import json, sys

purpose, config_path, project_root, only_id = sys.argv[1:5]
cfg = json.load(open(config_path))
logs_dir = project_root + "/logs"
by_id = {s["id"]: s for s in cfg["services"]}

def sub(text, svc):
    log_path = logs_dir + "/" + svc.get("log_file", svc["id"] + ".log")
    return (text.replace("{project_root}", project_root)
                .replace("{logs_dir}", logs_dir)
                .replace("{log_file}", log_path))

def start_row(s):
    return "\t".join([
        s["id"], s["name"], sub(s["start"]["dir"], s), sub(s["start"]["cmd"], s),
        logs_dir + "/" + s.get("log_file", s["id"] + ".log"),
        str(s.get("port") or ""), s["status_cmd"],
    ])

def stop_row(s):
    stop = s.get("stop")
    if stop:
        mode, value = stop["mode"], sub(stop["value"], s)
    elif s.get("port"):
        mode, value = "port", str(s["port"])
    else:
        return None
    return "\t".join([s["id"], s["name"], "1" if s.get("self") else "0", mode, value])

rows = []
if purpose in ("start-order", "one-start"):
    ids = cfg.get("autostart_order", []) if purpose == "start-order" else [only_id]
    for sid in ids:
        s = by_id.get(sid)
        if s and s.get("start"):
            rows.append(start_row(s))
    if purpose == "one-start" and not rows:
        sys.stderr.write(f"服务不存在或没有启动配置: {only_id}\n")
        sys.exit(2)
elif purpose in ("stop-order", "one-stop"):
    if purpose == "one-stop":
        row = stop_row(by_id.get(only_id, {"id": only_id}))
        if row:
            rows.append(row)
        else:
            sys.stderr.write(f"服务不存在或没有停止配置: {only_id}\n")
            sys.exit(2)
    else:
        auto = cfg.get("autostart_order", [])
        stoppable = [s for s in cfg["services"] if s.get("stop") or s.get("port")]
        extras = [s for s in stoppable if s["id"] not in auto]
        ordered = [by_id[sid] for sid in reversed(auto) if sid in by_id]
        for s in extras + ordered:
            row = stop_row(s)
            if row:
                rows.append(row)
elif purpose == "status":
    for s in cfg["services"]:
        rows.append("\t".join([s["id"], s["name"], str(s.get("port") or ""),
                               s.get("url") or "", s["status_cmd"]]))
else:
    sys.stderr.write(f"未知 purpose: {purpose}\n")
    sys.exit(2)

print("\n".join(rows))
PY
}

# svc_start_one id name dir cmd log_path port status_cmd
svc_start_one() {
    local id=$1 name=$2 dir=$3 cmd=$4 log_path=$5 port=$6 status_cmd=$7

    if [ -n "$port" ] && port_busy "$port"; then
        log_warn "$name 已在运行中 (端口 $port)"
        return 0
    fi
    if [ -z "$port" ] && bash -c "$status_cmd" >/dev/null 2>&1; then
        log_warn "$name 已在运行中"
        return 0
    fi
    if [ ! -d "$dir" ]; then
        log_error "$name 目录不存在: $dir"
        return 1
    fi

    log_info "启动 $name ..."
    mkdir -p "$LOGS_DIR" "$(dirname "$log_path")"
    ( cd "$dir" && nohup bash -c "$cmd" >> "$log_path" 2>&1 & )

    if [ -n "$port" ]; then
        if wait_for_port "$port" 20; then
            log_success "$name 启动成功 (端口 $port)"
        else
            log_warn "$name 已拉起，端口 $port 暂未就绪（可能仍在初始化，详见 $(basename "$log_path")）"
        fi
    else
        sleep 3
        log_success "$name 已拉起（详见 $(basename "$log_path")）"
    fi
    return 0
}

# svc_stop_one id name is_self mode value
# 停止面板自身需设置 STOP_PANEL=1（延迟 1 秒再杀，让调用方先收到输出）
svc_stop_one() {
    local id=$1 name=$2 is_self=$3 mode=$4 value=$5

    if [ "$is_self" = "1" ]; then
        if [ "${STOP_PANEL:-0}" = "1" ]; then
            log_info "停止 $name (端口 $value) ..."
            ( sleep 1; lsof -ti :"$value" | xargs kill 2>/dev/null ) >/dev/null 2>&1 &
            log_success "$name 将在 1 秒后停止"
        else
            log_warn "跳过 $name（默认不停自身；需要连面板一起停: 加 --panel 参数）"
        fi
        return 0
    fi

    case "$mode" in
        port)
            if ! port_busy "$value"; then
                log_warn "$name 未在运行"
                return 0
            fi
            local pids
            pids=$(lsof -ti :"$value")
            kill $pids 2>/dev/null
            if wait_port_free "$value" 5; then
                log_success "$name 已停止 (端口 $value)"
            else
                kill -9 $pids 2>/dev/null
                log_success "$name 已强制停止 (端口 $value)"
            fi
            ;;
        pattern)
            local pids
            pids=$(ps aux | grep "$value" | grep -v grep | awk '{print $2}')
            if [ -z "$pids" ]; then
                log_warn "$name 未在运行"
                return 0
            fi
            kill $pids 2>/dev/null
            sleep 2
            kill -0 $pids 2>/dev/null && kill -9 $pids 2>/dev/null
            log_success "$name 已停止 (PID $(echo $pids | tr '\n' ' '))"
            ;;
        cmd)
            log_info "停止 $name ..."
            bash -c "$value" >/dev/null 2>&1
            log_success "$name 停止命令已执行"
            ;;
        *)
            log_error "$name 未知停止模式: $mode"
            return 1
            ;;
    esac
    return 0
}
