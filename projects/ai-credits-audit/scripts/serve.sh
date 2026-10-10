#!/usr/bin/env bash
# 积分看板服务 —— 带采集 API
#
# 必须用 scripts/server.py，不能用 `python3 -m http.server`：
# 标准静态服务器没有 /api/refresh，页面的「立即采集刷新」按钮会失效。
# 历史教训：早期版本按钮叫「立即刷新」但只重读 JSON，名不副实。
#
# 用法:
#   bash "$SKILL/scripts/serve.sh"          # 默认 8787
#   bash "$SKILL/scripts/serve.sh" 9090

set -uo pipefail
PORT="${1:-8787}"
_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="${SKILL:-$_SELF}"
[ -d "$SKILL/scripts" ] || SKILL="$_SELF"   # 旧路径残留时回退
URL="http://127.0.0.1:${PORT}/assets/dashboard.html"

[ -f "$SKILL/data/credits.json" ] || { echo "找不到 $SKILL/data/credits.json"; exit 1; }

# 端口已被别的 server.py 占着就直接复用
if curl -sf -o /dev/null "http://127.0.0.1:${PORT}/api/status"; then
  echo "服务已在运行: $URL"
  case "$(uname -s)" in Darwin) open "$URL" ;; esac
  exit 0
fi

echo "积分看板服务已启动"
echo "  数据目录 : $SKILL"
echo "  看板     : $URL"
echo "  采集 API : POST http://127.0.0.1:${PORT}/api/refresh"
echo "  停止     : Ctrl+C"
echo

case "$(uname -s)" in
  Darwin) open "$URL" ;;
  Linux)  command -v xdg-open >/dev/null && xdg-open "$URL" || true ;;
esac

exec python3 "$SKILL/scripts/server.py" "$PORT"