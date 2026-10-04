#!/bin/bash
# 🎯 停止单个服务（服务定义见 config/services.json）
# 用法: ./scripts/stop-service.sh <服务id> [--panel]
# 不带参数时列出所有可停止的服务 id

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$PROJECT_ROOT/scripts/utils/service-control.sh"

if [ $# -lt 1 ]; then
    echo "用法: $0 <服务id> [--panel]"
    echo ""
    echo "可停止的服务:"
    svc_query stop-order | awk -F'\t' '{printf "   %-28s %s\n", $1, $2}'
    exit 1
fi

[ "${2:-}" = "--panel" ] && STOP_PANEL=1

rows=$(svc_query one-stop "$1") || exit 2
while IFS=$'\t' read -r id name is_self mode value; do
    svc_stop_one "$id" "$name" "$is_self" "$mode" "$value"
done <<< "$rows"
