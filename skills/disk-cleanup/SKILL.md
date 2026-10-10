---
name: disk-cleanup
description: 分析并清理 macOS 本地磁盘空间。当用户提到磁盘空间不足、清理磁盘、释放空间、磁盘占用、storage 已满、clean disk、free up space、清理缓存、清理 Gradle/npm/IDE 缓存、清理系统垃圾时触发。覆盖：分析各目录占用、定位大文件、安全清理可删除的缓存和临时文件。适用于 macOS 系统。
---

# macOS 磁盘空间清理

## 工作流程

### Step 1：整体磁盘概况

```bash
df -h / | tail -1
```

输出显示总容量、已用、可用、使用率。如果可用空间 < 10% 或已用 > 80%，需要清理。

### Step 2：扫描主要占用目录

并行执行以下 `du` 命令，获取各目录大小：

```bash
# 核心目录（并行执行）
du -sh ~/Library/Caches 2>/dev/null
du -sh ~/Library/Application\ Support 2>/dev/null
du -sh ~/Downloads 2>/dev/null
du -sh ~/.cache 2>/dev/null
du -sh ~/.npm 2>/dev/null
du -sh ~/.gradle 2>/dev/null
du -sh ~/soft 2>/dev/null
du -sh ~/Documents 2>/dev/null
du -sh ~/.Trash 2>/dev/null
du -sh ~/.codex 2>/dev/null
du -sh ~/.lmstudio 2>/dev/null
du -sh /opt/homebrew 2>/dev/null
```

### Step 3：定位大文件（>100MB）

```bash
find ~ -maxdepth 4 -type f -size +100M 2>/dev/null | head -30
```

### Step 4：逐层下钻

对 Step 2 中最大的目录，用 `du -sh */` 下钻一层。例如：

```bash
# 对最大的目录 Application Support (79GB)
du -sh ~/Library/Application\ Support/* 2>/dev/null | sort -rh | head -20
```

### Step 5：识别可清理项

按类别整理，标注安全级别：

| 类别 | 典型路径 | 安全清理？ |
|------|---------|-----------|
| 回收站 | `~/.Trash` | ✅ 随时 |
| 应用缓存 | `~/Library/Caches/*` | ✅ 通常安全 |
| npm 缓存 | `~/.npm/_cacache` | ✅ 重新安装时自动重建 |
| Gradle 缓存 | `~/.gradle/caches` | ✅ 重新构建时重建 |
| IDE 缓存 | `~/Library/Application Support/*/Cached*` | ✅ 安全 |
| IDE 扩展 | `~/Library/Application Support/*/User/extensions` | ⚠️ 卸载扩展 |
| 浏览器缓存 | `~/Library/Application Support/Code/Cache` | ✅ 安全 |
| LLM 模型 | `~/.lmstudio/models/` | ⚠️ 不再使用的模型 |
| Homebrew 包 | `/opt/homebrew/Cellar` | ❌ 不要手动删 |
| 开发项目 | `~/soft/` | ⚠️ 不再使用的项目 |

### Step 6：执行清理

对每个确认要清理的目录执行删除。删除前后都 `du -sh` 确认大小变化。

```bash
# 示例：清理 Gradle 缓存
du -sh ~/.gradle/caches          # 清理前
rm -rf ~/.gradle/caches/*        # 清理
du -sh ~/.gradle                 # 清理后

# 示例：清理 VS Code 缓存
rm -rf ~/Library/Application\ Support/Code/Cache/*
rm -rf ~/Library/Application\ Support/Code/CachedData/*
rm -rf ~/Library/Application\ Support/Code/CachedExtensionVSIXs/*
rm -rf ~/Library/Application\ Support/Code/logs/*
rm -rf ~/Library/Application\ Support/Code/WebStorage/*

# 示例：清理 npm 缓存
npm cache clean --force

# 示例：清空回收站
rm -rf ~/.Trash/*

# 示例：清理 JetBrains 缓存
rm -rf ~/Library/Application\ Support/JetBrains/*/caches/*
```

### Step 7：输出清理报告

```markdown
## 磁盘清理报告

| 项目 | 清理前 | 清理后 | 释放 |
|------|--------|--------|------|
| Gradle caches | 3.4 GB | 0 B | 3.4 GB |
| VS Code Cache | 198 MB | 0 B | 198 MB |
| ... | ... | ... | ... |

**合计释放：约 X GB**
```

## 注意事项

- **不要删除**：`~/.codex`（Codex 工作区）、`~/soft`（开发项目）、`/opt/homebrew/Cellar`（Homebrew 包）、`~/.gitconfig` 等配置文件。
- **IDE 缓存清理后**：首次打开 IDE 会重新索引，可能短暂变慢，属于正常。
- **npm 缓存清理后**：下次 `npm install` 会自动重建缓存。
- **Gradle 缓存清理后**：下次 `./gradlew build` 会自动重建。
- **清理前**：确保目标应用（如 VS Code、IntelliJ）已退出，避免文件占用。
- **不确定时**：只清理明确的缓存目录，不碰数据目录。

## 参考

详细的安全清理指南见 [references/cleanup-guide.md](references/cleanup-guide.md)。
