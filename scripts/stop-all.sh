#!/bin/bash
# 🛑 一键停止所有本地服务
# 停止清单来自 config/services.json；默认不停管控台自身
# 用法: ./scripts/stop-all.sh [--panel]   （--panel 连 8090 面板一起停）

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$PROJECT_ROOT/scripts/utils/service-control.sh"

if [ "${1:-}" = "--panel" ]; then
    STOP_PANEL=1
fi

echo -e "${BLUE}🛑 开始停止所有本地服务...${NC}"
echo ""

while IFS=$'\t' read -r id name is_self mode value; do
    svc_stop_one "$id" "$name" "$is_self" "$mode" "$value"
done < <(svc_query stop-order)

echo ""
echo -e "${GREEN}🎉 服务停止流程完成！${NC}"
echo "📝 日志文件保留在: $LOGS_DIR"
echo "🚀 重新启动: ./scripts/start-all.sh"
