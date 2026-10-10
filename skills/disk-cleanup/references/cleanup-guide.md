# macOS 磁盘安全清理指南

## 目录

1. [系统级清理](#1-系统级清理)
2. [开发者工具清理](#2-开发者工具清理)
3. [IDE 清理](#3-ide-清理)
4. [浏览器清理](#4-浏览器清理)
5. [AI 工具清理](#5-ai-工具清理)
6. [应用清理](#6-应用清理)
7. [危险操作 - 不要做](#7-危险操作---不要做)

---

## 1. 系统级清理

### 回收站
```bash
rm -rf ~/.Trash/*
# 约 393 MB
```

### 系统缓存
```bash
# 用户缓存目录
rm -rf ~/Library/Caches/*
# 约 24 GB，清理后应用会重新生成

# 注意：不要删整个 Caches 目录本身，只删内容
```

### 大文件查找
```bash
# 查找 >100MB 的文件
find ~ -maxdepth 4 -type f -size +100M 2>/dev/null

# 查找 >500MB 的文件
find ~ -maxdepth 4 -type f -size +500M 2>/dev/null
```

---

## 2. 开发者工具清理

### npm 缓存（~8.5 GB）
```bash
npm cache clean --force
```

### Gradle 缓存（~3.7 GB）
```bash
rm -rf ~/.gradle/caches/*
# 或者用 Gradle 自带的 clean
./gradlew clean
```

### Homebrew 缓存
```bash
brew cleanup --prune=all
# 不要删 /opt/homebrew/Cellar 下的包
```

### Python 虚拟环境
```bash
# 查找不再使用的 venv
find ~ -maxdepth 5 -type d -name "venv" -o -name ".venv" 2>/dev/null | head -20
```

---

## 3. IDE 清理

### VS Code（~7.3 GB）
```bash
# 缓存
rm -rf ~/Library/Application\ Support/Code/Cache/*
rm -rf ~/Library/Application\ Support/Code/CachedData/*
rm -rf ~/Library/Application\ Support/Code/CachedExtensionVSIXs/*
rm -rf ~/Library/Application\ Support/Code/logs/*
rm -rf ~/Library/Application\ Support/Code/WebStorage/*

# 不删：User/extensions（扩展）和 User/workspaceStorage（工作区状态）
```

### JetBrains 系列（~10 GB）
```bash
# 各版本 IDE 缓存
rm -rf ~/Library/Application\ Support/JetBrains/*/caches/*
rm -rf ~/Library/Caches/JetBrains/*

# 各版本索引
rm -rf ~/Library/Caches/com.jetbrains.*
```

### Cursor（~4 GB）
```bash
rm -rf ~/Library/Application\ Support/Cursor/Cache/*
rm -rf ~/Library/Application\ Support/Cursor/CachedData/*
```

### Trae 系列（~6.9 GB 合计）
```bash
# Trae / TRAE SOLO / Trae CN
rm -rf ~/Library/Application\ Support/Trae*/Cache/*
rm -rf ~/Library/Application\ Support/Trae*/CachedData/*
rm -rf ~/Library/Application\ Support/Trae*/WebStorage/*
```

### Windsurf / Qoder / Kiro 等 AI 编辑器
```bash
rm -rf ~/Library/Application\ Support/Windsurf/Cache/*
rm -rf ~/Library/Application\ Support/Qoder/Cache/*
rm -rf ~/Library/Application\ Support/Kiro/Cache/*
```

---

## 4. 浏览器清理

### Chrome / Edge / Arc
```bash
# Chrome
rm -rf ~/Library/Application\ Support/Google/Chrome/Default/Cache/*
rm -rf ~/Library/Application\ Support/Google/Chrome/Default/Code\ Cache/*

# Edge
rm -rf ~/Library/Application\ Support/Microsoft\ Edge/Default/Cache/*
```

### 所有 Electron 应用缓存
```bash
# 查找所有应用缓存
du -sh ~/Library/Application\ Support/*/Cache 2>/dev/null | sort -rh | head -20
```

---

## 5. AI 工具清理

### LM Studio 模型（~5.5 GB）
```bash
# 查看已下载模型
ls -lh ~/.lmstudio/models/

# 删除不再使用的模型
rm -rf ~/.lmstudio/models/<model-folder>
```

### Claude 缓存
```bash
rm -rf ~/Library/Application\ Support/Claude/Cache/*
rm -rf ~/Library/Application\ Support/Claude-3p/vm_bundles/*    # 9.7 GB
```

### Kimi Desktop
```bash
rm -rf ~/Library/Application\ Support/kimi-desktop/Cache/*
```

---

## 6. 应用清理

### 钉钉
```bash
rm -rf ~/Library/Application\ Support/DingTalkMac/Cache/*
```

### 百度网盘
```bash
rm -rf ~/Library/Application\ Support/baidunetdisk/*
rm -rf ~/Library/Application\ Support/com.baidu.BaiduNetdisk-mac/*
```

### 其他应用缓存
```bash
# 查找 >100MB 的 Application Support 子目录
du -sh ~/Library/Application\ Support/* 2>/dev/null | sort -rh | head -30
```

---

## 7. 危险操作 - 不要做

| 操作 | 原因 |
|------|------|
| 删除 `/opt/homebrew/Cellar/*` | 会破坏 Homebrew 安装 |
| 删除 `~/.codex/` | Codex 工作区和配置 |
| 删除 `~/soft/` | 开发项目 |
| 删除 `~/.gitconfig` | Git 全局配置 |
| 删除 `~/Library/Application\ Support/*/User/extensions` | 会丢失已安装的扩展 |
| 删除 `~/.ssh/` | SSH 密钥 |
| 删除 `~/Library/Keychains/` | 系统密钥链 |
| 删除 `~/Library/Messages/` | iMessage 聊天记录 |

---

## 快速参考命令

```bash
# 一键分析（输出到文件）
{
  echo "=== 磁盘概况 ==="
  df -h / | tail -1
  echo ""
  echo "=== 主要目录 ==="
  du -sh ~/Library/Caches ~/Library/Application\ Support ~/Downloads \
       ~/.cache ~/.npm ~/.gradle ~/.Trash ~/.codex ~/.lmstudio \
       ~/soft ~/Documents /opt/homebrew 2>/dev/null | sort -rh
  echo ""
  echo "=== Application Support 前20 ==="
  du -sh ~/Library/Application\ Support/* 2>/dev/null | sort -rh | head -20
  echo ""
  echo "=== 大文件 (>100MB) ==="
  find ~ -maxdepth 4 -type f -size +100M 2>/dev/null | head -30
} > ~/Desktop/disk-report.txt
open ~/Desktop/disk-report.txt
```
