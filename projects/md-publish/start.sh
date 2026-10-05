#!/usr/bin/env bash
# 启动「MD 多平台同步台」：① 纯前端静态页（8095） ② 本地执行桥 bridge.mjs（8096）
# 执行桥把 playbooks/<平台>.js 喂给 ego-browser 确定性执行，全程不经过任何 AI/智能体平台。
set -uo pipefail
PORT="${PORT:-8095}"
BPORT="${BRIDGE_PORT:-8096}"
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/logs-bridge.out"
mkdir -p "$DIR"

node -v >/dev/null 2>&1 || { echo "!! 找不到 node，执行桥起不来（页面仍可当指令导出用）"; }

# 已在监听就别重复拉起（管控台可能已经单独启动过 bridge）
if lsof -nP -iTCP:"$BPORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "执行桥已在 :${BPORT} 监听，跳过启动"
else
  nohup env PORT="$BPORT" node "$DIR/bridge.mjs" >>"$LOG" 2>&1 &
  sleep 1
  if lsof -nP -iTCP:"$BPORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "执行桥 → http://127.0.0.1:${BPORT} · 日志 logs-bridge.out"
  else
    echo "!! 执行桥没起来，看看 $LOG"; tail -5 "$LOG" 2>/dev/null
  fi
fi

echo "MD 多平台同步台 → http://127.0.0.1:${PORT}"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIR"
