#!/bin/bash

# 🛑 一键停止所有本地服务脚本
# 用法: ./scripts/stop-all.sh

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOGS_DIR="$PROJECT_ROOT/logs"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 正在停止所有本地服务...${NC}"
echo ""

# 函数：停止服务
stop_service() {
    local name=$1
    local pattern=$2
    
    echo -e "${BLUE}📦 停止 $name...${NC}"
    
    # 查找并停止进程
    local pids=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')
    
    if [ -z "$pids" ]; then
        echo -e "${YELLOW}⚠️  未找到正在运行的 $name 进程${NC}"
    else
        for pid in $pids; do
            if kill $pid 2>/dev/null; then
                echo -e "${GREEN}✅ 已停止 PID $pid${NC}"
            else
                echo -e "${RED}❌ 无法停止 PID $pid${NC}"
            fi
        done
        
        # 等待几秒确保进程已停止
        sleep 2
        
        # 强制杀死任何残留进程
        local remaining_pids=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')
        if [ ! -z "$remaining_pids" ]; then
            echo "   强制终止残留进程..."
            for pid in $remaining_pids; do
                kill -9 $pid 2>/dev/null && echo "   强制终止 PID $pid" || echo "   无法强制终止 PID $pid"
            done
        fi
    fi
    echo ""
}

# 停止 Hermes Dashboard
echo -e "${BLUE}📦 停止 🤖 Hermes Agent 网关 UI...${NC}"
/Users/javaedge/.local/bin/hermes dashboard --stop 2>/dev/null && echo -e "${GREEN}✅ Hermes Dashboard 已停止${NC}" || echo -e "${YELLOW}⚠️  Hermes Dashboard 未运行或已停止${NC}"
echo ""

# 停止管理控制服务
stop_service "📡 Local Control 服务器管理台" "local-control.*npm"

# 停止前端服务（按依赖顺序的反序）
stop_service "📈 投资决策前端" "invest-decision-frontend.*npm"
stop_service "💰 基金项目前端" "jijin.*npm"
stop_service "🖥️ Code Select 前端应用" "code-select-front.*npm"
stop_service "📚 Java 面试教程" "Java-Interview-Tutorial.*npm"

# 停止后端服务
stop_service "🐍 基金后端服务" "flask.*fund_server"
stop_service "📊 投资决策后端服务" "invest-decision-0.0.1-SNAPSHOT.jar"
stop_service "☕ Education Platform 后端服务" "back-0.0.1-SNAPSHOT.jar"

# 停止基础设施服务
stop_service "🌐 FRP 内网穿透服务" "frpc"

# 停止 Redis (使用 brew 停止)
echo -e "${BLUE}📦 停止 Redis 缓存服务...${NC}"
if brew services list | grep redis | grep started > /dev/null; then
    brew services stop redis
    echo -e "${GREEN}✅ Redis 已停止${NC}"
else
    echo -e "${YELLOW}⚠️  Redis 服务未运行${NC}"
fi
echo ""

echo -e "${GREEN}🎉 所有服务已停止！${NC}"
echo ""
echo "📋 清理完成:"
echo "   • 所有进程已终止"
echo "   • Redis 服务已停止"
echo "   • FRP 连接已断开"
echo ""
echo "📝 日志文件保留在: $LOGS_DIR"
echo "🔄 重新启动服务: ./scripts/start-all.sh"