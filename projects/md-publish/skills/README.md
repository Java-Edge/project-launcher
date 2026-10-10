# skills/ —— 发文相关 skill 的全部实测依据

2026-10-10 从 `~/.agents/skills/` 整体迁入，源目录已全部删除。**这个目录是唯一事实来源**，项目不再依赖任何外部 skill 安装位置。

| 目录 | 附带文件 | 执行方式 |
|---|---|---|
| `juejin-publish/` | SKILL.md | `../playbooks/juejin.js`（确定性，零 LLM） |
| `csdn-publish/` | SKILL.md | `../playbooks/csdn.js`（确定性，零 LLM） |
| `cnblogs-publish/` | SKILL.md | `../playbooks/cnblogs.js`（确定性，零 LLM） |
| `51cto-publish/` | SKILL.md + `references/categories.json` + `references/troubleshooting.md` + `scripts/prepare_article.py` | `../playbooks/51cto.js`（确定性，零 LLM；预处理已内联，脚本仅留作人工/智能体兜底） |
| `toutiao-publish/` | SKILL.md | `../playbooks/toutiao.js`（只到草稿箱，最终提交人工点） |
| `douyin-publish/` | SKILL.md + `OPTIMIZED_WORKFLOW.md` + `evals/evals.json` | **无 playbook**，只能「复制指令」交给智能体照文档跑（文档实测于 bb-browser，属登录态例外） |
| `vuepress-article-publisher/` | SKILL.md + `scripts/publish_article.py` | **无 playbook**，本地改文件 + 改 `config.js` sidebar，不动浏览器；正文里的 `<skill_dir>` 解析为本目录绝对路径 |
| `blog-publish-search/` | SKILL.md | 不发文，是发文后的**地址反查**；页面卡片不引用它，纯参考文档 |

## 两份东西的分工

- **`../playbooks/<平台>.js` 是执行入口**：`bridge.mjs` 把它喂给 ego-browser 逐条跑，选择器全是写死的，运行期零大模型、零 skill 调用。页面点按钮走的就是这条路。
- **本目录的 SKILL.md 是出处和兜底**：记录每条选择器是哪天实测的、为什么这么写、失败时怎么判断。人工排查、或页面「复制指令」让智能体代跑时才读它 —— 「复制指令」生成的文案已指向这里的绝对路径（`index.html` DEFAULTS 的 `skillFile` 字段），不会再提 `~/.agents/skills`。
- 没接 playbook 的三家（抖音图文 / 编程严选网 / 地址反查）只有本目录这一份文档，所以它们**必须**留在这里：删了就等于丢了实测结论。

## 行号纪律（改文件前必读）

`playbooks/cnblogs.js` 有 20+ 处 `SKILL.md:<行号>`、`playbooks/toutiao.js` 有 `L<行号>` 引用，指的都是本目录对应文件的**物理行号**。所以：

- 只在**文件末尾追加**，绝不在中间插入或删除行；
- 需要改旧结论时，就地改写那一行（保持行数不变），或追加一条「订正 N」覆盖它；
- 每个平台文件末尾的「迁移说明与实测订正（2026-10-10）」就是按这条纪律追加的，记录了迁移后新测出的事实（头条封面必填且「无封面」失效、正文要走 paste 写 ProseMirror；CSDN NBSP 归一化；51CTO 必须真实鼠标点击；博客园 `#isPublished` 与 `?postId=` 覆盖风险）。

## 迁移校验记录

- `diff -r` 与源目录逐个比对，**迁移瞬间字节级全等**：五家博客平台 8 个文件 / 123,687 字节；抖音 3 个文件 / 20,904 字节；VuePress 2 个文件 / 29,656 字节；地址反查 1 个文件 / 15,711 字节。合计 14 个文件 / 189,958 字节。
- 迁移后每个 SKILL.md 只在**末尾追加**了迁移说明与实测订正；唯一的中途改写是 `51cto-publish/SKILL.md` 第 64 行（把 `prepare_article.py` 的调用路径指到项目内），前 387 行其余未动，行号引用仍然有效。
- 仓内旧路径引用已全部改指新位置：`playbooks/51cto.js`、`playbooks/toutiao.js` 头注释（另外三家 playbook 头注释补了 SKILL.md 路径），`index.html` 的 `PB_ROOT` / `skillFile` / `tool` 与「复制指令」文案。
- `~/.agents/skills` 下已无发文相关 skill；只剩通用工具类（`ego-browser`、`bb-browser`、`opencli` 等），同步台的微博卡片仍按 `opencli` CLI 走。
