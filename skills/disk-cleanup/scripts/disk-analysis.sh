#!/usr/bin/env bash
# macOS 磁盘空间分析报告
# 用法: bash disk-analysis.sh [输出文件路径]
# 默认输出到终端，也可指定文件路径

OUTPUT="${1:-}"

run() {
  if [ -n "$OUTPUT" ]; then
    echo "$1" >> "$OUTPUT"
  else
    echo "$1"
  fi
}

# 初始化
> "$OUTPUT" 2>/dev/null || true

run "========================================"
run "  macOS 磁盘空间分析报告"
run "  生成时间: $(date '+%Y-%m-%d %H:%M:%S')"
run "========================================"
run ""

# 1. 整体磁盘概况
run "=== 1. 整体磁盘概况 ==="
df -h / | tail -1 | awk '{printf "总容量: %s | 已用: %s | 可用: %s | 使用率: %s\n", $2, $3, $4, $5}'
run ""

# 2. 主要目录占用
run "=== 2. 主要目录占用 ==="
for dir in \
  "~/Library/Caches" \
  "~/Library/Application Support" \
  "~/Downloads" \
  "~/.cache" \
  "~/.npm" \
  "~/.gradle" \
  "~/.Trash" \
  "~/.codex" \
  "~/.lmstudio" \
  "~/soft" \
  "~/Documents" \
  "~/Movies" \
  "~/Pictures" \
  "/opt/homebrew"
do
  size=$(du -sh "$dir" 2>/dev/null | cut -f1)
  if [ -n "$size" ]; then
    run "  $(echo "$dir" | sed 's|^~|$HOME|'): $size"
  fi
done
run ""

# 3. Application Support 详细
run "=== 3. Application Support 前 20 ==="
du -sh ~/Library/Application\ Support/* 2>/dev/null | sort -rh | head -20 | while read size path; do
  run "  $path: $size"
done
run ""

# 4. 大文件
run "=== 4. 大文件 (>100MB) ==="
find ~ -maxdepth 4 -type f -size +100M 2>/dev/null | head -30 | while read f; do
  size=$(du -sh "$f" 2>/dev/null | cut -f1)
  run "  $size  $f"
done
run ""

# 5. 可清理建议
run "=== 5. 可清理建议 ==="
run "  [安全] 回收站:       $(du -sh ~/.Trash 2>/dev/null | cut -f1)"
run "  [安全] npm 缓存:      $(du -sh ~/.npm 2>/dev/null | cut -f1)"
run "  [安全] Gradle 缓存:   $(du -sh ~/.gradle/caches 2>/dev/null | cut -f1)"
run "  [安全] 系统缓存:      $(du -sh ~/Library/Caches 2>/dev/null | cut -f1)"

# 估算可清理总量
CLEANABLE=0
for item in "~/.npm" "~/.gradle/caches" "~/Library/Caches" "~/.Trash"; do
  size=$(du -sh "$item" 2>/dev/null | cut -f1)
  if [[ "$size" =~ ^[0-9]+G$ ]]; then
    CLEANABLE=$((CLEANABLE + ${size%G}))
  elif [[ "$size" =~ ^[0-9]+M$ ]]; then
    CLEANABLE=$((CLEANABLE + ${size%M}/1024))
  fi
done
run "  [估算] 可清理总量:     ~${CLEANABLE} GB"
run ""

# 6. 输出文件
if [ -n "$OUTPUT" ]; then
  run "报告已保存到: $OUTPUT"
fi

# 终端输出时打开文件
if [ -z "$OUTPUT" ]; then
  tmp="/tmp/disk-report-$(date +%s).txt"
  run "报告已保存到: $tmp"
  open "$tmp" 2>/dev/null || true
fi
