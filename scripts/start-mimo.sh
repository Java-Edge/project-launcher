#!/bin/bash

# 🤖 MiMo Code (小米 AI 编码代理) 启动脚本
# 用法: ./scripts/start-mimo.sh

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

MIMO_BIN="$HOME/.mimocode/bin/mimo"

echo -e "${BLUE}🤖  MiMo Code 状态检查...${NC}"
echo ""

if [ ! -f "$MIMO_BIN" ]; then
    echo -e "${RED}❌ MiMo Code 未安装${NC}"
    echo "   安装命令: curl -fsSL https://mimo.xiaomi.com/install | bash"
    exit 1
fi

echo -e "${GREEN}✅ MiMo Code: $("$MIMO_BIN" --version)${NC}"
echo -e "${GREEN}✅ 路径: $MIMO_BIN${NC}"
echo ""
echo "使用方式:"
echo "  cd <项目目录> && mimo          # 交互式 TUI"
echo "  mimo --version                  # 查看版本"
echo ""
