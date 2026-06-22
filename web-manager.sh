#!/bin/bash

# 🌐 启动Web管理界面脚本
# 提供一个美观的Web界面来管理所有本地服务

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WEB_PORT=8090

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 启动项目启动管理器 - Web 管理界面${NC}"
echo "================================"
echo ""

# 检查Python版本
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 未安装${NC}"
    echo "请安装 Python3 后重试"
    exit 1
fi

# 检查端口是否被占用
if lsof -i :$WEB_PORT &> /dev/null; then
    echo -e "${YELLOW}⚠️  端口 $WEB_PORT 已被占用${NC}"
    echo "正在尝试停止占用进程..."
    lsof -ti:$WEB_PORT | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# 检查server.py文件是否存在
if [ ! -f "$PROJECT_ROOT/server.py" ]; then
    echo -e "${RED}❌ server.py 文件未找到: $PROJECT_ROOT/server.py${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 启动配置检查完成${NC}"
echo ""

# 启动Web服务器
cd "$PROJECT_ROOT"

# 设置环境变量
export PYTHONPATH="$PROJECT_ROOT:$PYTHONPATH"

echo -e "${BLUE}📊 启动Web管理界面...${NC}"
echo "   🌐 访问地址: http://localhost:$WEB_PORT"
echo "   📱 功能包括:"
echo "      🔍 实时服务状态监控"
echo "      📝 服务日志查看"
echo "      🚀 一键启动/停止服务"
echo "      🎯 快速跳转到应用页面"
echo ""
echo -e "${YELLOW}💡 提示: 使用 Ctrl+C 停止服务器${NC}"
echo ""

# 启动服务器
python3 server.py $WEB_PORT