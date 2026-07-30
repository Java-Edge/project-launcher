#!/bin/bash

# 🚀 一键启动所有本地服务脚本
# 用法: ./scripts/start-all.sh

set -e

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOGS_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOGS_DIR"

echo "🚀 开始启动所有本地服务..."
echo "📁 项目根目录: $PROJECT_ROOT"
echo "📝 日志目录: $LOGS_DIR"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 函数：启动服务
start_service() {
    local name=$1
    local dir=$2
    local cmd=$3
    local log_file=$4
    
    echo -e "${BLUE}📦 启动 $name...${NC}"
    echo "   路径: $dir"
    echo "   命令: $cmd"
    
    if [ ! -d "$dir" ]; then
        echo -e "${RED}❌ 目录不存在: $dir${NC}"
        return 1
    fi
    
    # 在后台启动服务
    cd "$dir"
    eval "$cmd" > "$LOGS_DIR/$log_file.log" 2>&1 &
    local pid=$!
    
    # 等待几秒检查进程是否还在运行
    sleep 3
    if kill -0 $pid 2>/dev/null; then
        echo -e "${GREEN}✅ $name 启动成功 (PID: $pid)${NC}"
        echo "   日志: $LOGS_DIR/$log_file.log"
    else
        echo -e "${RED}❌ $name 启动失败，请检查日志: $LOGS_DIR/$log_file.log${NC}"
    fi
    echo ""
    
    # 返回原目录
    cd "$PROJECT_ROOT"
}

# 1. 启动 Redis (基础设施服务)
start_service "🔴 Redis 缓存服务" "/usr/local" "brew services start redis" "redis"

# 2. 启动 FRP 内网穿透
start_service "🌐 FRP 内网穿透服务" "/Users/javaedge/soft/frp_0.34.3_darwin_amd64" "./frpc -c ./frpc.ini" "frp"

# 3. 启动 Local Control 服务器管理台
start_service "📡 Local Control 服务器管理台" "/Users/javaedge/soft/VSProjects/local-control" "npm run dev" "local-control"

# 4. 等待基础设施服务启动
sleep 5

# 5. 启动 Spring Boot 后端服务
start_service "☕ Education Platform 后端服务" "/Users/javaedge/soft/IDEAProjects/education-platform/education-back/target" "java --add-opens java.base/java.lang=ALL-UNNAMED -server -XX:+UseZGC -Xms512m -Xmx2g -XX:+AlwaysPreTouch -XX:+UseStringDeduplication -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Shanghai -Dspring.profiles.active=dev -jar back-0.0.1-SNAPSHOT.jar" "education-backend"

start_service "📊 投资决策后端服务" "/Users/javaedge/soft/VSProjects/invest-decision/invest-decision-backend/target" "java --add-opens java.base/java.lang=ALL-UNNAMED -server -XX:+UseZGC -Xms512m -Xmx2g -XX:+AlwaysPreTouch -XX:+UseStringDeduplication -XX:TieredStopAtLevel=1 -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Shanghai -Dspring.profiles.active=dev -jar invest-decision-0.0.1-SNAPSHOT.jar" "invest-decision-backend"

# 6. 启动 Flask 后端服务
start_service "🐍 基金后端服务" "/Users/javaedge/soft/PyCharmProjects/fund" "flask --app fund_server run --host=0.0.0.0 --port=8311 --no-debugger --no-reload" "fund-backend"

# 7. 等待后端服务启动
sleep 8

# 8. 启动前端服务
start_service "📚 Java 面试教程" "/Users/javaedge/soft/VSProjects/Java-Interview-Tutorial" "npm run dev -- --port 8081" "java-interview"

start_service "🖥️ Code Select 前端应用" "/Users/javaedge/soft/VSProjects/code-select-front" "npm run serve -- --port 8082" "code-select"

start_service "💰 基金项目前端" "/Users/javaedge/soft/VSProjects/jijin" "npm run dev" "fund-frontend"

start_service "📈 投资决策前端" "/Users/javaedge/soft/VSProjects/invest-decision/invest-decision-front" "npm run dev" "invest-decision-frontend"

echo -e "${GREEN}🎉 所有服务启动完成！${NC}"
echo ""
echo "📊 服务概览:"
echo "   🌐 FRP 服务: 多个代理端口"
echo "   📡 Local Control: http://localhost:3457"
echo "   📚 Java 面试教程: http://localhost:8081"
echo "   🖥️ Code Select: http://localhost:8082"
echo "   💰 基金项目: http://localhost:3000"
echo "   🐍 基金后端: http://localhost:8311"
echo "   📈 投资决策前端: http://localhost:5173"
echo ""
echo "📝 查看实时日志:"
echo "   tail -f $LOGS_DIR/*.log"
echo ""
echo "🛑 停止所有服务:"
echo "   ./scripts/stop-all.sh"
echo ""

# 显示进程状态
sleep 2
echo "📈 服务状态检查:"
ps aux | grep -E "(redis-server|frpc|java.*jar|flask|npm|node|local-control)" | grep -v grep || echo "⚠️  未发现正在运行的进程"