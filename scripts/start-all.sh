#!/bin/bash
# 🚀 一键启动所有本地服务
# 服务清单与启动顺序来自 config/services.json 的 autostart_order
# 用法: ./scripts/start-all.sh

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$PROJECT_ROOT/scripts/utils/service-control.sh"

echo -e "${BLUE}🚀 开始启动所有本地服务...${NC}"
echo "📝 日志目录: $LOGS_DIR"
echo ""

FAIL=0
while IFS=$'\t' read -r id name dir cmd log_path port status_cmd; do
    svc_start_one "$id" "$name" "$dir" "$cmd" "$log_path" "$port" "$status_cmd" || FAIL=$((FAIL + 1))
done < <(svc_query start-order)

echo ""
if [ "$FAIL" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  完成，$FAIL 个服务启动失败（目录缺失等），详见上方日志${NC}"
else
    echo -e "${GREEN}🎉 所有服务启动完成！${NC}"
fi
echo ""
echo "🛠️  TUI/交互工具（需独立终端，按需启动）:"
echo "   🥧 Pi 编码代理:    ./scripts/start-pi.sh"
echo "   🤖 OMP 编码代理:   ./scripts/start-omp.sh"
echo "   🤖 Grok CLI:       ./scripts/start-grok.sh"
echo "   🤖 Muse + LM Studio: ./scripts/start-muse.sh"
echo "   🤖 MiMo Code:      ./scripts/start-mimo.sh"
echo ""
echo "📊 查看状态: ./scripts/status.sh  或打开面板 http://localhost:8090"
