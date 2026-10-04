#!/usr/bin/env bash
# 启动 OMP (Oh-My-Pi) 编码代理 (TUI 交互模式)
# 在独立终端窗口中运行，方便日常工作使用
# 用法: ./scripts/start-omp.sh [工作目录]

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOGS_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOGS_DIR"
LOG_FILE="$LOGS_DIR/omp.log"

WORKSPACE="${1:-/Users/javaedge/soft}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚀 正在启动 OMP 编码代理..." | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📂 工作目录: $WORKSPACE" | tee -a "$LOG_FILE"

# 在独立 Terminal 窗口中启动 omp
osascript -e "tell application \"Terminal\"
    activate
    do script \"cd $WORKSPACE && omp\"
end tell" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ OMP 终端已启动" | tee -a "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 💡 切换到终端窗口开始使用，/help 查看帮助" | tee -a "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ 启动失败，请手动运行: cd $WORKSPACE && omp" | tee -a "$LOG_FILE"
    exit 1
fi
