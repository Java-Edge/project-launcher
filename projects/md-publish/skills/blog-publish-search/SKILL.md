---
name: blog-publish-search
description: 全网搜索某篇博客文章的发布地址。覆盖 CSDN、腾讯云、知乎、头条号、博客园、掘金、51CTO、阿里云、SegmentFault、InfoQ、网易、微信公众号等中文技术平台。
---

# 博客发布地址全网搜索

## 触发条件
用户提供文章标题和作者名，要求搜索该文章在哪些平台发布过。

## 搜索策略

### 第零步：作者主页直接浏览（最可靠，必须先做！）

如果知道作者在各平台的用户名（如 JavaEdge），直接访问作者主页浏览文章列表，比任何搜索引擎都可靠。**搜索引擎 site: 搜索覆盖率有限，51CTO 等平台经常搜不到已发布文章，但作者主页一定能看到。**

| 平台 | 作者主页 URL 模式 | 说明 |
|------|-------------------|------|
| 51CTO | `https://blog.51cto.com/{作者名}` | 文章列表页，直接 Ctrl+F 搜标题关键词 |
| CSDN | `https://blog.csdn.net/{作者名}` | 文章列表页，可能需要翻页 |
| 博客园 | `https://www.cnblogs.com/{作者名}` | 首页即最新文章列表 |
| 掘金 | `https://juejin.cn/user/{作者ID}/posts` | 需要作者数字 ID，非用户名 |
| 腾讯云 | `https://cloud.tencent.com/developer/column/{作者名}` | 专栏页面 |
| SegmentFault | `https://segmentfault.com/u/{作者名}` | 个人主页有文章列表 |
| 知乎 | `https://www.zhihu.com/people/{作者名}` | 需要知乎 ID |
| 头条号 | `https://www.toutiao.com/c/user/token/{作者ID}/` | 需要数字 ID |
| 阿里云 | `https://developer.aliyun.com/profile/{作者ID}` | 需要数字 ID |

**操作**：用 ego-browser 打开作者主页，滚动加载更多文章，用 `js()` 提取页面文字内容，在内容中搜索标题关键词。如果文章列表超过一页，翻页继续找。

### 第一步：Google site: 精确搜索（辅助手段，不可单独依赖）

用 Google 的 `site:` 操作符逐个平台搜索。**注意：此方法的覆盖率有限，尤其是 51CTO、阿里云、SegmentFault 等平台，site: 搜索经常返回 0 结果即使文章确实已发布。site: 返回 0 不等于没发过，必须结合第零步和第二步确认。**

```
https://www.google.com/search?q=文章标题+site:平台域名
```

示例：
- CSDN: `https://www.google.com/search?q=%E4%B8%8D%E5%81%9C%E6%9C%BA%E6%9B%BF%E6%8D%A2%E6%95%B0%E6%8D%AE%E5%BA%93%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88+site:csdn.net`
- 腾讯云: `https://www.google.com/search?q=%E4%B8%8D%E6%9C%BA%E6%9B%BF%E6%8D%A2%E6%95%B0%E6%8D%AE%E5%BA%93%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88+site:cloud.tencent.com`
- 知乎: `https://www.google.com/search?q=%E4%B8%8D%E5%81%9C%E6%9C%BA%E6%9B%BF%E6%8D%A2%E6%95%B0%E6%8D%AE%E5%BA%93%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88+site:zhihu.com+作者名`
- 博客园: `https://www.google.com/search?q=%E4%B8%8D%E5%81%9C%E6%9C%BA%E6%9B%BF%E6%8D%A2%E6%95%B0%E6%8D%AE%E5%BA%93%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88+site:cnblogs.com`
- 头条号: `https://www.google.com/search?q=%E4%B8%8D%E5%81%9C%E6%9C%BA%E6%9B%BF%E6%8D%A2%E6%95%B0%E6%8D%AE%E5%BA%93%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88+site:toutiao.com+作者名`
- CSDN + 作者: `https://www.google.com/search?q=%E4%B8%8D%E5%81%9C%E6%9C%BA%E6%9B%BF%E6%8D%A2%E6%95%B0%E6%8D%AE%E5%BA%93%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88+site:csdn.net+作者名`

**注意**：标题需要 URL 编码。如果精确搜索（带引号）搜不到，去掉引号用宽泛搜索。

**重要**：如果使用 Trae 的 WebSearch 工具（而非 ego-browser 浏览器）做 site: 搜索，覆盖率更低，因为 WebSearch 只返回前 5-10 条结果，且对中文长标题的精确匹配能力较弱。WebSearch site: 返回 0 条时，**绝对不能直接判定"未发布"**，必须执行第二步。

### 第二步：平台站内搜索（强制！site: 返回 0 的平台必须执行）

**当第一步 Google site: 对某个平台返回 0 结果时，必须对该平台执行站内搜索，不能直接判定"未找到"。** 对 Google 有结果的平台也建议站内验证。

| 平台 | 搜索 URL | 注意事项 |
|------|----------|----------|
| CSDN | `https://so.csdn.net/search/blog?wd=关键词` | 搜索功能可能返回空或不准确 |
| 掘金 | `https://search.juejin.cn/search?keyword=关键词` | 可能连接被关闭，需要重试 |
| 博客园 | `https://www.cnblogs.com/search/?keyword=关键词` | 可能返回 404，换 URL 试试 |
| 知乎 | `https://www.zhihu.com/search?type=content&q=关键词` | 用知乎 AI 搜索也能出结果 |
| 51CTO | `https://so.51cto.com/search?keyword=关键词` | 搜索结果可能不完整 |
| 腾讯云 | `https://cloud.tencent.com/developer/search/word?keyword=关键词` | 结果可能被其他内容淹没 |
| 阿里云 | `https://developer.aliyun.com/search?keyword=关键词` | 需要登录才显示完整结果 |
| SegmentFault | `https://segmentfault.com/a/ask/关键词` | 可能返回 404 |
| 搜狗微信 | `https://weixin.sogou.com/weixin?type=1&query=关键词+作者名` | 只能搜到公众号文章 |
| 头条号 | `https://so.toutiao.com/search?keyword=关键词` | 搜索结果丰富，包含摘要 |
| InfoQ | `https://www.infoq.cn/search?k=关键词` | 可能返回 404 |
| 网易 | `https://so.163.com/chaxun?keyword=关键词` | 证书问题，可能无法访问 |

### 第三步：百度交叉验证

```
https://www.baidu.com/s?wd=%22文章标题%22
```

百度对中文内容的索引有时比 Google 更完整。

## 搜索流程

1. **作者主页浏览（第零步）** — 如果知道作者在各平台的用户名，先用 ego-browser 逐个打开作者主页，浏览文章列表。这是最可靠的方式，搜索引擎可能漏索引，但作者主页一定有
2. **Google site: 搜索（第一步）** — 逐个平台，用 ego-browser 或 WebSearch 工具做 site: 搜索
3. **提取结果** — 用 `js()` 提取搜索结果中的标题和 URL
4. **验证结果** — 对找到的链接，打开页面确认作者和标题匹配
5. **平台站内搜索（第二步，强制）** — **对第一步返回 0 结果的每个平台，必须执行站内搜索，不能直接判定"未找到"**
6. **百度交叉验证** — 用百度搜索确认
7. **深挖原始出处** — 如果只在一个平台找到，必须继续深挖是否原创（见下方"深挖策略"）
8. **个人站点验证** — 搜索作者个人站点，确认文章是否被索引
9. **汇总结果** — 区分原文首发、转载、改写，标注原创性

### 判定规则（关键！）

- **"未找到"判定条件**：必须同时满足 ① Google site: 返回 0 ② 平台站内搜索返回 0 ③ 作者主页无此文章。三者缺一不可，**只凭 Google site: 返回 0 不能判定"未找到"**
- **教训案例**：`blog.51cto.com/JavaEdge/12484538` 这篇 51CTO 文章，Google `site:51cto.com` 搜索返回 0，但文章实际存在。原因是 51CTO 对搜索引擎的索引覆盖很差，必须直接访问作者主页 `blog.51cto.com/JavaEdge` 才能看到

### 深挖策略（关键！）

当 Google site: 搜索**只找到一个平台**有结果时，**不能直接下结论**，必须继续深挖：

**步骤 A：搜索课程/知识付费平台**
很多"博客"其实是极客时间、慕课网、拉勾教育等付费课程的改写/笔记。
```
https://www.google.com/search?q=极客时间+文章标题关键词
https://www.google.com/search?q=慕课网+文章标题关键词
https://www.google.com/search?q=拉勾教育+文章标题关键词
```

**步骤 B：搜索"阅读笔记"、"学习笔记"**
```
https://www.google.com/search?q=极客时间+课程名+阅读笔记
https://www.google.com/search?q=文章标题关键词+阅读笔记
```
如果掘金、博客园、GitHub Pages 上有大量同一课程的阅读笔记，说明原始出处是课程。

**步骤 C：搜索作者个人站点**
```
https://www.google.com/search?q=site:作者域名
https://www.google.com/search?q=文章标题+site:作者域名
```
如果个人站点有索引但没这篇文章，说明文章可能不在个人站点首发，或者站点已关闭但 Google 还有旧索引。

**步骤 D：检查文章底部标注**
- "本文分享自 作者个人站点/博客" — 说明文章是从个人站点同步到腾讯云的
- "本文参与 腾讯云自媒体同步曝光计划" — 确认是同步/转载
- 直接访问标注的个人站点链接，看是否有原文

**步骤 E：对比内容结构**
打开极客时间课程页面，对比文章结构与课程章节是否一致。如果章节标题、案例、步骤完全一致，说明是改写/笔记整理。

### 原创性判断标准

| 判断 | 依据 |
|------|------|
| 原创首发 | 个人站点/博客首发，其他平台标注转载 |
| 改写/笔记 | 内容结构与课程/书籍高度一致，标注"本文分享自作者个人站点" |
| 转载 | 明确标注转载来源，内容几乎相同 |
| 疑似非原创 | 只在一个平台找到，且内容与其他付费课程高度相似 |

### 时间线分析

搜索完成后，按时间线整理所有发布记录：

1. **极客时间课程发布** — 原始内容首次出现（付费内容）
2. **个人站点发布** — 作者是否在个人站点首发
3. **腾讯云同步** — 通过"自媒体同步曝光计划"同步
4. **其他平台转载/笔记** — 掘金、博客园等的阅读笔记或转载

时间线能清晰展示文章的传播路径和原创性。

## 关键实现细节

### ego-browser 操作模板

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('search blog')

// 打开搜索页
await openOrReuseTab('https://www.google.com/search?q=关键词', { wait: true, timeout: 15 })
await scrollBy(3000)
await wait(2)

// 提取搜索结果
const results = await js(String.raw`(() => {
  const posts = []
  document.querySelectorAll('a').forEach(a => {
    const href = a.href
    const title = a.textContent.trim()
    if (href && href.includes('目标域名') && !href.includes('google.com')) {
      posts.push({ title: title.substring(0, 100), url: href })
    }
  })
  return posts.slice(0, 15)
})()`)

cliLog('=== 搜索结果 ===')
for (const p of results) {
  cliLog(p.title)
  cliLog(`  ${p.url}`)
}
EOF
```

### 深挖原始出处的代码模板

```bash
# 搜索极客时间等课程平台
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('search blog')

await openOrReuseTab('https://www.google.com/search?q=极客时间+文章标题关键词', { wait: true, timeout: 15 })
await scrollBy(4000)
await wait(2)

const results = await js(String.raw`(() => {
  const posts = []
  document.querySelectorAll('a').forEach(a => {
    const href = a.href
    const title = a.textContent.trim()
    if (href && href.includes('time.geekbang.org') && !href.includes('google.com')) {
      posts.push({ title: title.substring(0, 120), url: href })
    }
  })
  return posts.slice(0, 10)
})()`)

cliLog('=== 极客时间 ===')
for (const p of results) {
  cliLog(p.title)
  cliLog(`  ${p.url}`)
}
EOF
```

```bash
# 搜索阅读笔记/学习笔记
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('search blog')

await openOrReuseTab('https://www.google.com/search?q=极客时间+课程名+阅读笔记', { wait: true, timeout: 15 })
await scrollBy(4000)
await wait(2)

const results = await js(String.raw`(() => {
  const posts = []
  document.querySelectorAll('a').forEach(a => {
    const href = a.href
    const title = a.textContent.trim()
    if (href && (href.includes('juejin.cn') || href.includes('cnblogs.com') || href.includes('github.io')) && !href.includes('google.com')) {
      posts.push({ title: title.substring(0, 120), url: href })
    }
  })
  return posts.slice(0, 15)
})()`)

cliLog('=== 阅读笔记 ===')
for (const p of results) {
  cliLog(p.title)
  cliLog(`  ${p.url}`)
}
EOF
```

```bash
# 搜索作者个人站点
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('search blog')

await openOrReuseTab('https://www.google.com/search?q=site:javaedge.cn', { wait: true, timeout: 15 })
await scrollBy(4000)
await wait(2)

const body = await js(String.raw`document.body?.innerText?.substring(0, 5000)`)
cliLog('=== 个人站点索引 ===')
cliLog(body)
EOF
```

### 验证文章详情

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('search blog')

await openOrReuseTab('文章URL', { wait: true, timeout: 15 })
await scrollBy(2000)
await wait(2)

// 提取作者、标题、发布时间
const body = await js(String.raw`document.body?.innerText?.substring(0, 3000)`)
cliLog(body)
EOF
```

## 常见坑

1. **CSDN 搜索功能不稳定** — 经常返回空或错误结果，优先用 Google site: 搜索
2. **掘金搜索可能连接关闭** — 重试或跳过
3. **博客园搜索返回 404** — 换 URL 或用 Google site: 代替
4. **网易证书问题** — 浏览器拦截，跳过
5. **Google 精确搜索搜不到** — 去掉引号，用宽泛搜索
6. **搜索结果被截断** — 需要 scrollBy 后再提取
7. **文章底部标注** — 注意看"本文分享自 作者个人站点/博客"，说明可能在个人站点首发
8. **Google 搜索结果需要 scrollBy** — 不滚动可能只抓到导航链接
9. **极客时间/慕课网等课程平台** — 很多"博客"实际上是付费课程的改写/笔记，需要交叉验证
10. **个人站点可能无法访问** — javaedge.cn 等站点可能已关闭或网络不通，但 Google 仍有索引
11. **51CTO 搜索引擎索引覆盖极差（血泪教训）** — Google `site:51cto.com` 搜索返回 0 不代表文章没发过！51CTO 的文章大量未被 Google 索引。**必须直接访问作者主页** `blog.51cto.com/{作者名}` 浏览文章列表，这是 51CTO 唯一可靠的排查方式
12. **WebSearch 工具 ≠ 浏览器搜索** — Trae 的 WebSearch 工具只返回前几条结果，对中文长标题精确匹配能力弱，site: 搜索覆盖率远不如浏览器直接搜。WebSearch 返回 0 时必须用 ego-browser 做浏览器搜索或直接访问作者主页
13. **标题改写导致精确匹配失败** — 很多平台发布时标题会改写（去掉编号前缀如"02-"、加修饰词等），精确搜索搜不到时，用标题核心关键词做宽泛搜索

## 已验证的平台覆盖

| 平台 | 搜索方式 | 成功率 |
|------|----------|--------|
| 腾讯云 | Google site: + 站内搜索 | 高 |
| CSDN | Google site: + 作者主页 | 中（站内搜索差） |
| 知乎 | Google site: + 站内搜索 | 中 |
| 博客园 | Google site: + 作者主页 | 中 |
| 头条号 | Google site: + 站内搜索 | 中 |
| 51CTO | **作者主页直接浏览**（site: 极不可靠） | 低（site:）/ 高（作者主页） |
| 阿里云 | Google site: + 站内搜索 | 低 |
| SegmentFault | Google site: + 作者主页 | 低 |
| InfoQ | Google site: + 站内搜索 | 低 |
| 网易 | Google site: + 站内搜索 | 低（证书问题） |
| 微信公众号 | 搜狗微信搜索 | 中 |

## 输出格式

```
## 确认已发布的平台

**平台名（原文首发/转载/改写）**
- 文章标题：xxx
- 链接：xxx
- 作者：xxx
- 发布时间：xxx
- 备注：xxx

## 搜索过但未找到的平台

- CSDN — 未找到
- 知乎 — 未找到
- ...

## 原创性分析

**原始出处**
- 平台：xxx
- 标题：xxx
- 作者：xxx
- 链接：xxx
- 发布时间：xxx
- 说明：xxx

**改写/转载关系**
- 腾讯云文章底部标注："本文分享自 作者个人站点/博客"
- 内容结构与极客时间课程第20讲高度一致
- 判断为改写/笔记整理，非原创

**个人站点验证**
- javaedge.cn — 有索引但没收录这篇文章
```
---

## 迁移说明（2026-10-10）

> 本文件 2026-10-10 从 `~/.agents/skills/blog-publish-search/` **原样**迁入
> `project-launcher/projects/md-publish/skills/blog-publish-search/`，源目录随后删除，本仓库是唯一副本（1 个文件 / 15,711 字节，`diff -r` 无差异）。

- 它不发文，是**发文之后的反查**：给标题+作者，查这篇文章在 12 个中文平台上各自的发布地址。
- 与同步台的配合：`playbooks/<平台>.js` 直发成功后回读的链接（掘金 `/spost/`、CSDN `article/details/`、51CTO `blog.51cto.com/JavaEdge/<id>`、博客园 `/p/<id>.html`）就是这份清单要核对的目标；头条号因为只落到草稿箱，反查时它应当**查不到**。
- 迁进本仓库后它只是参考文档，同步台页面不引用它（`DEFAULTS` 里没有对应卡片）。
