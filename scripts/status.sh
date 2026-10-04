#!/bin/bash
# 📊 检查所有服务状态（服务清单来自 config/services.json）
# 用法: ./scripts/status.sh

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$PROJECT_ROOT/scripts/utils/service-control.sh"

echo -e "${BLUE}📊 本地服务状态检查${NC}"
echo "================================"
echo ""

RUNNING=0
TOTAL=0

while IFS=$'\t' read -r id name port url status_cmd; do
    TOTAL=$((TOTAL + 1))
    if bash -c "$status_cmd" >/dev/null 2>&1; then
        RUNNING=$((RUNNING + 1))
        status_line="${GREEN}✅ 运行中${NC}"
    else
        status_line="${RED}❌ 未运行${NC}"
    fi

    echo -e "${BLUE}${name}:${NC}"
    echo -e "   进程状态: $status_line"
    if [ -n "$port" ]; then
        if port_busy "$port"; then
            echo -e "   端口 $port: ${GREEN}✅ 已监听${NC}"
        else
            echo -e "   端口 $port: ${RED}❌ 未监听${NC}"
        fi
    fi
    [ -n "$url" ] && echo -e "   访问地址: ${GREEN}${url}${NC}"
    echo ""
done < <(svc_query status)

echo "================================"
echo -e "总计: ${GREEN}${RUNNING} 运行中${NC} / ${TOTAL} 个服务"
echo ""
echo "🔧 管理命令:"
echo "   🚀 启动所有服务: ./scripts/start-all.sh"
echo "   🛑 停止所有服务: ./scripts/stop-all.sh"
echo "   🎯 启动单个服务: ./scripts/start-service.sh <服务id>"
echo "   📊 查看实时日志: tail -f $LOGS_DIR/*.log"
