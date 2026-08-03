#!/usr/bin/env bash
# 启动 Pi 编码代理 (TUI 交互模式)
# 在独立终端窗口中运行，方便日常工作使用

LOG_FILE="/Users/javaedge/soft/VSProjects/project-launcher/logs/pi.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚀 正在启动 Pi 编码代理..." | tee -a "$LOG_FILE"

# 检测默认项目目录
WORKSPACE="${1:-/Users/javaedge/soft}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📂 工作目录: $WORKSPACE" | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 💡 使用 /model 切换模型，/help 查看帮助" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 启动 Pi
cd "$WORKSPACE" && pi 2>&1 | tee -a "$LOG_FILE"
