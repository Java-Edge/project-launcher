#!/bin/bash

# 🤖 Grok Build (xAI CLI) 启动脚本
# 用法: ./scripts/start-grok.sh

set -e

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOGS_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOGS_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🤖 启动 Grok Build (xAI CLI)...${NC}"
echo ""

# 检查 grok 是否已安装
if ! command -v grok &> /dev/null; then
    echo -e "${RED}❌ grok 未安装，请先运行:${NC}"
    echo "   curl -fsSL https://x.ai/cli/install.sh | bash"
    exit 1
fi

echo -e "${GREEN}✅ grok 已安装: $(grok --version)${NC}"
echo ""

# 启动 grok 交互式会话
echo -e "${YELLOW}💡 提示: grok 是交互式 CLI 工具，将在前台运行${NC}"
echo -e "${YELLOW}   输入 /help 查看可用命令，输入 /exit 退出${NC}"
echo ""
echo "-------------------------------------------"
echo ""

# 启动 grok
exec grok
