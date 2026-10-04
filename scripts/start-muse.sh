#!/bin/bash

# 🤖 Muse Code + LM Studio 代理启动脚本
# 用法: ./scripts/start-muse.sh

set -e

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOGS_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOGS_DIR"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🤖 启动 Muse Code + LM Studio 代理...${NC}"
echo ""

# 检查 Muse
if ! ~/.local/bin/muse --version &>/dev/null; then
    echo -e "${RED}❌ Muse 未安装，请运行: curl -fsSL https://dev.meta.ai/install.sh | sh${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Muse: $(~/.local/bin/muse --version)${NC}"

# 检查 LM Studio
if ! curl -s --max-time 5 http://127.0.0.1:1234/v1/models &>/dev/null; then
    echo -e "${RED}❌ LM Studio 未运行 (127.0.0.1:1234)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ LM Studio: 运行中${NC}"

# 检查代理是否已运行
if [ -f /tmp/muse-proxy.pid ] && kill -0 "$(cat /tmp/muse-proxy.pid)" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  代理已在运行 (PID: $(cat /tmp/muse-proxy.pid))${NC}"
else
    # 启动代理
    nohup python3 "$PROJECT_ROOT/scripts/muse-proxy.py" > "$LOGS_DIR/muse-proxy.log" 2>&1 &
    echo $! > /tmp/muse-proxy.pid
    sleep 2
    if curl -s --max-time 5 http://127.0.0.1:18888/muse-code/models &>/dev/null; then
        echo -e "${GREEN}✅ 代理启动成功 (PID: $(cat /tmp/muse-proxy.pid))${NC}"
    else
        echo -e "${RED}❌ 代理启动失败${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}🎉 Muse Code 已就绪！${NC}"
echo ""
echo "配置信息:"
echo "  Muse 版本: $(~/.local/bin/muse --version)"
echo "  代理地址: http://127.0.0.1:18888"
echo "  LM Studio: http://127.0.0.1:1234"
echo "  默认模型: qwen3.8-27b-mlx"
echo ""
echo "使用方式:"
echo "  ~/.local/bin/muse                          # 交互式 TUI"
echo "  ~/.local/bin/muse exec \"你的问题\"          # 单次执行"
echo "  ~/.local/bin/muse --base-url http://127.0.0.1:18888/v1 exec \"问题\"  # 指定代理"
echo ""
