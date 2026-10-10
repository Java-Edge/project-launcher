#!/bin/bash
# L4 跳板机远程网页浏览脚本
# Usage: ./l4-curl.sh <URL> [curl options...]
# Example: ./l4-curl.sh http://example.com
#          ./l4-curl.sh -X POST -H "Content-Type: application/json" -d '{"k":"v"}' http://example.com/api

HOST="2408:860c:5:611:3:c600:0:e77"
PORT="22"
USER="root"
PASS="N#@2YEl7dJwerpoi"
SSH_OPTS="-6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <URL> [curl options...]"
  echo "Example: $0 http://example.com"
  exit 1
fi

URL="${@: -1}"
CURL_OPTS="${@:1:$#-1}"

echo "🔗 通过移动云 L4 跳板机访问: $URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 构建 curl 命令
CURL_CMD="curl -sL --max-time 30 $CURL_OPTS '$URL'"

# 通过 SSH 执行
sshpass -p "$PASS" ssh $SSH_OPTS "${USER}@${HOST}" -p "$PORT" "$CURL_CMD" 2>/dev/null

EXIT_CODE=$?
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ 请求成功"
else
  echo "❌ 请求失败 (exit code: $EXIT_CODE)"
fi
exit $EXIT_CODE
