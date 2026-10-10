---
name: vuepress-article-publisher
description: "将本地 markdown 文章一键发布到 VuePress 项目（编程严选网结构），自动完成文件复制、config.js 的 sidebar 侧边栏配置修改，并后台启动 dev 服务验证渲染。支持扁平专栏（docs/md/<专栏>/）和嵌套子目录（docs/md/<专栏>/<子目录>/）。当用户需要添加/发布一篇 markdown 文章到 VuePress 博客、在 docs/md 专栏下新增文章并配置侧边栏、或输入本地 md 文件路径要求前端网页能显示该文章时使用。"
---

# VuePress 文章发布

将本地 markdown 文件发布到 VuePress 项目，自动完成 README 中描述的配置步骤。

## 核心原则

- **URL 只用英文 slug**：发布后的文件名是英文 slug（小写字母、数字、连字符），URL 不含中文。`--slug` 指定；不指定时自动从标题提取 ASCII 英文生成；纯中文标题必须用 `--slug` 显式指定。
- **标题只进正文**：中文标题（`--display-name`）只用于补全文章首行一级标题（sidebar 显示名），不进入文件名和 URL。
- **nav 默认不修改**：顶部导航中的条目是分类入口，新文章通常不需要进 nav，通过 sidebar 和直接 URL 访问。仅当用户明确要求时才用 `--nav-update` 更新。
- **sidebar 必须配置**：文章必须出现在侧边栏才能被浏览。sidebar 中插入 slug（不带 .md，与项目现有条目风格一致）。

## 输入要求

每次发布需要：
- **md 文件绝对路径**（必填）
- **专栏目录名** `--column`（必填）：如 `AI`、`java`、`spring`
- **子目录名** `--subdir`（可选）：如 `agent`、`ml`、`llm`，文件将放到 `docs/md/<专栏>/<子目录>/`
- **sidebar 子分组** `--sidebar-group`（可选）：如 `"智能体发展"`，指定加到 sidebar 哪个子分组；不指定则加到第一个子分组
- **文章标题** `--display-name`（可选，推荐）：中文标题，用于补全文章首行一级标题（sidebar 显示名）；`--nav-update` 时兼作 nav 显示名。不指定时用原文件名（去 .md）作标题
- **英文 slug** `--slug`（可选）：URL 文件名（不含扩展名），如 `reasoning-models-technical-approach`。不指定时自动从标题提取 ASCII 英文生成 kebab-case；标题为纯中文时自动生成失败，会报错要求用 `--slug` 指定

可选参数：
- `--nav-update`：更新 nav（默认不更新）
- `--port`：dev 端口（默认 8081）
- `--no-dev`：只改配置不启动服务
- `--project-root`：项目根目录（默认自动向上检测）

## 执行流程

1. **校验**：md 文件存在；确定 slug（`--slug` 指定或自动从标题提取 ASCII 英文）；纯中文标题无 slug 时报错退出。
2. **复制文件**：到 `docs/md/<专栏>/[<子目录>/]<slug>.md`；目录不存在则自动创建。
3. **补全一级标题**：检查文章是否有 `# 一级标题`，没有则自动用 `--display-name`（或原文件名）补全到文章开头。VuePress sidebar 用一级标题作为显示名，没有的话会显示成第一个二级标题（如"0 前言"）。**标题只写进正文，不影响文件名。**
4. **备份 config.js**：修改前自动备份。
4. **nav**（仅 `--nav-update`）：定位专栏的 items 数组追加入口（link 用 slug）；找不到则告警跳过。
5. **sidebar**：
   - 有子目录时，sidebar 键为 `"/md/<专栏>/<子目录>/"`（如 `"/md/AI/agent/"`），不是 `"/md/<专栏>/"`。
   - 找到该分组，在指定子分组（`--sidebar-group`）的 children 中追加 slug（不带 .md）；不指定则加到第一个子分组。
   - 分组不存在则自动新建。
   - 子分组标题找不到时，错误信息会列出所有可用子分组。
6. **启动 dev 服务**：后台执行 `npm run dev -- --port <port>`，等待端口就绪，输出访问地址（slug.html）。

## 调用方式

```bash
# 扁平专栏（文件放 docs/md/java/，sidebar 加到第一个子分组）
python3 <skill_dir>/scripts/publish_article.py \
  --md-file /path/to/article.md --column java

# 嵌套专栏 + 中文标题 + 英文 slug（推荐，URL 干净）
python3 <skill_dir>/scripts/publish_article.py \
  --md-file /path/to/article.md --column AI --subdir llm \
  --sidebar-group "大模型发展" \
  --display-name "“思考模式”是怎么来的？看看这些推理模型的技术思路" \
  --slug reasoning-models-technical-approach

# 自动生成 slug（标题含英文时，如 "GPT-5.6 发布" → gpt-5-6）
python3 <skill_dir>/scripts/publish_article.py \
  --md-file /path/to/article.md --column AI --subdir llm --display-name "GPT-5.6 发布"

# 需要同时更新 nav
python3 <skill_dir>/scripts/publish_article.py \
  --md-file /path/to/article.md --column java --nav-update --display-name "文章标题"
```

## 验证

脚本输出：
- 文章文件路径（`<slug>.md`）
- 访问地址：`http://localhost:<port>/md/<专栏>/[<子目录>/]<slug>.html`（URL 无中文）
- 首页地址

打开访问地址确认渲染；侧边栏应能看到该文章入口。

## 回滚

修改前自动备份的 config.js 在 `docs/.vuepress/config.js.bak.<时间戳>`，覆盖回 `config.js` 并删除新增 md 文件即可。

## 注意事项

- URL 文件名一律为英文 slug；`--display-name` 只进首行一级标题，绝不写入文件名。
- 纯中文标题（如《"思考模式"是怎么来的？》）无法自动生成英文 slug，脚本会报错并要求 `--slug` 指定，这是预期行为而非故障。
- slug 自动生成规则：从标题/文件名提取 ASCII 字母数字，转小写、空格转连字符；只含数字编号（如日期前缀 `26-07-18-1`）时视为不可用，需 `--slug` 指定。
- 文章内容中的尖括号需包进代码块，否则可能导致空白页。
- 嵌套专栏（如 AI/agent）有独立的 sidebar 分组 `"/md/AI/agent/"`，不要错配到 `"/md/AI/"`。
- nav 中的分类条目（如"AI Agent"）通常指向该子目录的第一篇文章，新文章不需要进 nav。
- dev 服务是长驻后台进程，日志在项目根目录 `vuepress-dev.log`。

---

## 迁移说明（2026-10-10）

> 本目录（`SKILL.md` + `scripts/publish_article.py`）2026-10-10 从 `~/.agents/skills/vuepress-article-publisher/` **原样**迁入
> `project-launcher/projects/md-publish/skills/vuepress-article-publisher/`，源目录随后删除，本仓库是唯一副本。
> 迁入时字节级一致（2 个文件 / 29,656 字节，`diff -r` 无差异），迁入后除本节追加外正文未改。

- 正文里的 `<skill_dir>` 占位符现在解析为：
  `/Users/javaedge/soft/VSProjects/project-launcher/projects/md-publish/skills/vuepress-article-publisher`。
- 这个平台不是外部网站，而是**本地 VuePress 站点（编程严选网）**：改文件 + 改 `docs/.vuepress/config.js` 的 sidebar + 起 dev 服务验证，
  没有浏览器登录态，所以同步台里标了 `noDraft:true`、也没有 playbook；仍按「复制指令」交给智能体（或自己跑那条 python 命令）执行。
- 目标项目根由 `--project-root` 指定（默认向上自动检测），迁移本 skill 不影响它指向哪个 VuePress 仓库。
