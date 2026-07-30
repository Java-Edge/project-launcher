#!/bin/bash

# 📊 检查所有服务状态脚本
# 用法: ./scripts/status.sh

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOGS_DIR="$PROJECT_ROOT/logs"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 本地服务状态检查${NC}"
echo "========================"
echo ""

# 函数：检查服务状态
check_service() {
    local name=$1
    local pattern=$2
    local port=$3
    
    echo -e "${BLUE}$name:${NC}"
    
    # 检查进程
    local pids=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')
    
    if [ -z "$pids" ]; then
        echo -e "   进程状态: ${RED}❌ 未运行${NC}"
    else
        echo -e "   进程状态: ${GREEN}✅ 运行中 (PID: $pids)${NC}"
    fi
    
    # 检查端口（如果提供了端口）
    if [ ! -z "$port" ]; then
        if lsof -i :$port > /dev/null 2>&1; then
            echo -e "   端口 $port: ${GREEN}✅ 已监听${NC}"
        else
            echo -e "   端口 $port: ${RED}❌ 未监听${NC}"
        fi
    fi
    
    echo ""
}

# 检查 Redis
echo -e "${BLUE}🔴 Redis 缓存服务:${NC}"
if brew services list | grep redis | grep started > /dev/null; then
    echo -e "   服务状态: ${GREEN}✅ 运行中${NC}"
    redis-cli ping > /dev/null 2>&1 && echo -e "   连接测试: ${GREEN}✅ 正常${NC}" || echo -e "   连接测试: ${RED}❌ 失败${NC}"
else
    echo -e "   服务状态: ${RED}❌ 未运行${NC}"
fi
echo ""

# 检查 FRP
echo -e "${BLUE}🌐 FRP 内网穿透服务:${NC}"
if ps aux | grep frpc | grep -v grep > /dev/null; then
    echo -e "   进程状态: ${GREEN}✅ 运行中${NC}"
    # 检查最后一行日志
    if [ -f "$LOGS_DIR/frp.log" ]; then
        local last_line=$(tail -1 "$LOGS_DIR/frp.log")
        echo "   最新日志: $last_line"
    fi
else
    echo -e "   进程状态: ${RED}❌ 未运行${NC}"
fi
echo ""

# 检查 Local Control
echo -e "${BLUE}📡 Local Control 服务器管理台:${NC}"
if ps aux | grep local-control.*npm | grep -v grep > /dev/null; then
    echo -e "   进程状态: ${GREEN}✅ 运行中${NC}"
    # 检查端口
    if lsof -i :3457 > /dev/null 2>&1; then
        echo -e "   端口 3457: ${GREEN}✅ 已监听${NC}"
        echo "   🌐 管理界面: http://localhost:3457"
    else
        echo -e "   端口 3457: ${RED}❌ 未监听${NC}"
    fi
    # 检查最后一行日志
    if [ -f "$LOGS_DIR/local-control.log" ]; then
        local last_line=$(tail -1 "$LOGS_DIR/local-control.log")
        echo "   最新日志: $last_line"
    fi
else
    echo -e "   进程状态: ${RED}❌ 未运行${NC}"
fi
echo ""

# 检查各个服务
check_service "☕ Education Platform 后端服务" "back-0.0.1-SNAPSHOT.jar" ""
check_service "🐍 基金后端服务" "flask.*fund_server" "8311"
check_service "📊 投资决策后端服务" "invest-decision-0.0.1-SNAPSHOT.jar" ""

check_service "📚 Java 面试教程" "Java-Interview-Tutorial.*npm" "8081"
check_service "🖥️ Code Select 前端应用" "code-select-front.*npm" "8082"
check_service "💰 基金项目前端" "jijin.*npm" "3000"
check_service "📈 投资决策前端" "invest-decision-frontend.*npm" "5173"

echo "📝 日志文件:"
if [ -d "$LOGS_DIR" ]; then
    for log in "$LOGS_DIR"/*.log; do
        if [ -f "$log" ]; then
            filename=$(basename "$log")
            size=$(du -h "$log" | cut -f1)
            echo "   📄 $filename ($size)"
        fi
    done
else
    echo "   ❌ 日志目录不存在"
fi
echo ""

echo "🔧 管理命令:"
echo "   🚀 启动所有服务: ./scripts/start-all.sh"
echo "   🛑 停止所有服务: ./scripts/stop-all.sh"
echo "   📊 查看实时日志: tail -f $LOGS_DIR/*.log"