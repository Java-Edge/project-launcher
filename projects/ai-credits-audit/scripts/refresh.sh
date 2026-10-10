#!/usr/bin/env bash
# 每日积分刷新 —— 一站式入口
#
#   bash "$SKILL/scripts/refresh.sh"          # 完整刷新（采集 + 更新数据层）
#   bash "$SKILL/scripts/refresh.sh" check    # 只体检：数据多旧了、看板服务在不在
#
# 由 launchd 每日调用（见 scripts/com.ai-credits-audit.daily.plist）。
# 注意：定时任务跑在无 UI 的后台会话里，ego-browser 若因缺图形会话失败，
# 会写入 log 并置 NEEDS_AGENT 标记，等你下次开会话时由 agent 接手完成。

set -uo pipefail
_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="${SKILL:-$_SELF}"
[ -d "$SKILL/scripts" ] || SKILL="$_SELF"   # 旧路径残留时回退
DATA="$SKILL/data/credits.json"
RAW="$SKILL/data/raw"
LOG_DIR="$SKILL/data/logs"
STALE_HOURS="${STALE_HOURS:-12}"
mkdir -p "$RAW" "$LOG_DIR"

log(){ printf '%s  %s\n' "$(date '+%F %T')" "$*"; }

data_age_hours(){
  [ -f "$DATA" ] || { echo 99999; return; }
  python3 - "$DATA" <<'EOF'
import json,sys,datetime
d=json.load(open(sys.argv[1]))
s=d.get("snapshot","").replace("+08:00","")
try:
    t=datetime.datetime.fromisoformat(s)
except Exception:
    print(99999); raise SystemExit
print(round((datetime.datetime.now()-t).total_seconds()/3600,1))
EOF
}

case "${1:-full}" in
  check)
    A=$(data_age_hours)
    log "数据快照年龄: ${A}h（阈值 ${STALE_HOURS}h）"
    if awk "BEGIN{exit !($A > $STALE_HOURS)}"; then
      log "状态: STALE —— 需要刷新"
      exit 1
    fi
    log "状态: FRESH"
    PORT=$(grep -oE 'localhost:[0-9]+' "$SKILL/scripts/serve.sh" 2>/dev/null | head -1 | cut -d: -f2)
    PORT="${PORT:-8787}"
    if curl -sf -o /dev/null "http://127.0.0.1:${PORT}/data/credits.json"; then
      log "看板服务: 运行中 (127.0.0.1:${PORT})"
    else
      log "看板服务: 未运行 —— bash \"\$SKILL/scripts/serve.sh\" ${PORT} 可启动"
    fi
    exit 0 ;;
esac

# ── 完整刷新 ──
log "===== 积分刷新开始 ====="
A=$(data_age_hours); log "旧快照年龄 ${A}h"
LATEST_RAW=$(ls -t "$RAW"/collect-*.json 2>/dev/null | head -1)
if [ -n "${SKIP_COLLECT:-}" ]; then
  log "SKIP_COLLECT 已设置，跳过浏览器采集"
else
  log "采集浏览器证据（机械部分自动化）…"
  if COLLECT_ONLY="${COLLECT_ONLY:-}" ego-browser nodejs < "$SKILL/scripts/collect-credits.js" \
       > "$LOG_DIR/collect-$(date +%F).log" 2>&1; then
    log "采集完成 -> $LOG_DIR/collect-$(date +%F).log"
  else
    log "采集失败（多半是后台无图形会话）。详见 $LOG_DIR/collect-$(date +%F).log"
    log "标记 NEEDS_AGENT，等下次 agent 会话接手"
    touch "$SKILL/data/NEEDS_AGENT"
  fi
fi

log "本地缓存扫描（签到证据）…"
python3 "$SKILL/scripts/scan-local-credits.py" --local \
  > "$LOG_DIR/local-$(date +%F).log" 2>&1 \
  && log "本地扫描 -> $LOG_DIR/local-$(date +%F).log" \
  || log "本地扫描失败"

if [ -n "$LATEST_RAW" ]; then log "上一份证据: $LATEST_RAW"; fi
log "解析回写数据层（Trae / Qoder / 扣子 格式确定，可自动解析）…"
if python3 "$SKILL/scripts/parse-evidence.py" > "$LOG_DIR/parse-$(date +%F).log" 2>&1; then
  log "解析 -> $LOG_DIR/parse-$(date +%F).log"
else
  log "解析失败（页面结构可能变了，需 agent 介入）"
fi

log "校验数据一致性…"
python3 "$SKILL/scripts/validate-data.py" > "$LOG_DIR/validate-$(date +%F).log" 2>&1
VRC=$?
log "校验 -> $LOG_DIR/validate-$(date +%F).log (rc=$VRC)"
[ $VRC -ne 0 ] && log "⚠ 有 ERROR，需 agent 修数据层"

A2=$(data_age_hours)
log "新快照年龄 ${A2}h"
log "===== 结束 ====="
log "提示：看板 http://127.0.0.1:8787/assets/dashboard.html 的「立即采集刷新」按钮可随时手动触发同一流程"
