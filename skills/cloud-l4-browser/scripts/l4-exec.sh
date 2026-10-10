#!/bin/bash
# L4 跳板机远程命令执行脚本
# Usage: ./l4-exec.sh <command>
# Example: ./l4-exec.sh "ls -la /var/log"

HOST="2408:860c:5:611:3:c600:0:e77"
PORT="22"
USER="root"
PASS="N#@2YEl7dJwerpoi"
SSH_OPTS="-6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <command>"
  echo "Example: $0 'ls -la /'"
  exit 1
fi

CMD="$*"

echo "🔧 在移动云 L4 服务器上执行命令:"
echo "   $CMD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

sshpass -p "$PASS" ssh $SSH_OPTS "${USER}@${HOST}" -p "$PORT" "$CMD" 2>/dev/null

EXIT_CODE=$?
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ 命令执行成功"
else
  echo "❌ 命令执行失败 (exit code: $EXIT_CODE)"
fi
exit $EXIT_CODE
