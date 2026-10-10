#!/usr/bin/env python3
"""积分看板服务 —— 静态文件 + 采集 API

为什么不能用 `python3 -m http.server`：
  页面的「立即刷新」需要真正触发采集（跑 ego-browser），而不是只重读 JSON。
  标准静态服务器没有这个能力，于是按钮名不副实——这是设计缺陷，不能留着。

接口:
  GET  /                     看板
  GET  /api/status           数据新鲜度（快照年龄、是否需要刷新）
  POST /api/refresh          完整刷新：采集 → 解析 → 回写 JSON → 返回差异
  POST /api/collect-only     只采集不解析（调试用）

用法:
  python3 "$SKILL/scripts/server.py" 8787
"""
import json
import os
import subprocess
import sys
import threading
import time
from datetime import date, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

_SELF = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 常驻进程（如 ego-browser）可能带着迁移前的旧 SKILL，目录不存在时回退脚本所在目录
_ENV_SKILL = os.environ.get("SKILL")
SKILL = _ENV_SKILL if _ENV_SKILL and os.path.isdir(os.path.join(_ENV_SKILL, "scripts")) else _SELF
DATA = os.path.join(SKILL, "data/credits.json")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
LOCK = threading.Lock()
STATE = {"running": False, "phase": "", "started": None, "last": None, "log": ""}


def snapshot_age_h():
    try:
        db = json.load(open(DATA))
        t = datetime.fromisoformat(db["snapshot"])
        return round((datetime.now().astimezone() - t).total_seconds() / 3600, 1)
    except Exception:
        return None


def run(cmd, env=None):
    e = dict(os.environ)
    e["SKILL"] = SKILL
    e.update(env or {})
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                       env=e, timeout=600)
    return p.returncode, p.stdout, p.stderr


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=SKILL, **kw)

    def log_message(self, fmt, *args):
        pass  # 静默，否则刷屏

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/status":
            return self._json({
                "snapshotAgeHours": snapshot_age_h(),
                "today": date.today().isoformat(),
                "running": STATE["running"],
                "phase": STATE["phase"],
                "last": STATE["last"],
            })
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] not in ("/api/refresh", "/api/collect-only"):
            return self._json({"error": "unknown endpoint"}, 404)
        if not LOCK.acquire(blocking=False):
            return self._json({"error": "已有刷新在进行中", "phase": STATE["phase"]}, 409)

        try:
            STATE.update(running=True, started=datetime.now().isoformat(timespec="seconds"),
                         phase="启动浏览器采集", log="")
            collect_only = self.path.endswith("collect-only")
            steps = []
            t0 = time.time()

            STATE["phase"] = "ego-browser 采集 8 个平台"
            rc, out, err = run(
                'ego-browser nodejs < "$SKILL/scripts/collect-credits.js"')
            steps.append({"step": "collect", "rc": rc,
                          "out": out[-2500:], "err": err[-800:]})
            if rc != 0:
                STATE.update(running=False, phase="采集失败")
                return self._json({"ok": False, "phase": "collect",
                                   "error": "ego-browser 采集失败", "steps": steps}, 500)

            if not collect_only:
                before = json.load(open(DATA))
                STATE["phase"] = "解析并回写 credits.json"
                rc2, out2, err2 = run('python3 "$SKILL/scripts/parse-evidence.py"')
                steps.append({"step": "parse", "rc": rc2,
                              "out": out2[-2000:], "err": err2[-800:]})
                STATE["phase"] = "校验一致性"
                rc3, out3, _ = run('python3 "$SKILL/scripts/validate-data.py"')
                steps.append({"step": "validate", "rc": rc3, "out": out3[-2500:]})

                after = json.load(open(DATA))
                diff = []
                b = {p["id"]: p for p in before["platforms"]}
                for p in after["platforms"]:
                    ob = b.get(p["id"])
                    if not ob:
                        continue
                    if ob.get("balance") != p.get("balance"):
                        diff.append({"id": p["id"], "field": "balance",
                                     "from": ob.get("balance"), "to": p.get("balance")})
                    oc, nc = ob.get("checkin") or {}, p.get("checkin") or {}
                    if oc.get("done") != nc.get("done"):
                        diff.append({"id": p["id"], "field": "checkin.done",
                                     "from": oc.get("done"), "to": nc.get("done")})
                    if len(ob.get("grants", [])) != len(p.get("grants", [])):
                        diff.append({"id": p["id"], "field": "grants.count",
                                     "from": len(ob.get("grants", [])),
                                     "to": len(p.get("grants", []))})

            STATE.update(running=False, phase="完成",
                         last=datetime.now().isoformat(timespec="seconds"),
                         log="\n".join(s["out"] for s in steps)[-4000:])
            return self._json({"ok": True, "elapsedSec": round(time.time() - t0, 1),
                               "diff": diff if not collect_only else [],
                               "snapshotAgeHours": snapshot_age_h(),
                               "steps": [{"step": s["step"], "rc": s["rc"]} for s in steps],
                               "stepsDetail": steps})
        except Exception as e:
            STATE.update(running=False, phase=f"异常: {e}")
            return self._json({"ok": False, "error": str(e)}, 500)
        finally:
            LOCK.release()


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    print(f"积分看板 + 采集 API: http://127.0.0.1:{PORT}/")
    print(f"  数据: {DATA}")
    print(f"  快照年龄: {snapshot_age_h()}h")
    print("  Ctrl+C 停止")
    srv.serve_forever()