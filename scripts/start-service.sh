#!/bin/bash
# 🎯 启动单个服务（服务定义见 config/services.json）
# 用法: ./scripts/start-service.sh <服务id>
# 不带参数时列出所有可启动的服务 id

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$PROJECT_ROOT/scripts/utils/service-control.sh"

if [ $# -ne 1 ]; then
    echo "用法: $0 <服务id>"
    echo ""
    echo "可启动的服务:"
    svc_query start-order | awk -F'\t' '{printf "   %-28s %s\n", $1, $2}'
    exit 1
fi

rows=$(svc_query one-start "$1") || exit 2
while IFS=$'\t' read -r id name dir cmd log_path port status_cmd; do
    svc_start_one "$id" "$name" "$dir" "$cmd" "$log_path" "$port" "$status_cmd"
done <<< "$rows"
