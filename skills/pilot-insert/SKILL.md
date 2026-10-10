---
name: pilot-insert
description: 将指定网站信息插入 education 项目的 pilot 导航表。当用户提供一个 URL 并要求"加入 pilot 表"、"加入导航"、"收录这个网站"时触发。负责抓取站点信息、匹配 pilot_type、检查重复（以 link 为准，非 name）、然后执行 INSERT。
---

# Pilot Insert Skill

将一个网站收录进 `education` 数据库的 `pilot` 导航表。

## 核心原则

**重复判断必须以 `link` 为准，而不是 `name`。** 同一个品牌（如 Manus、ChatGPT）可能有多条记录对应不同的 URL（国内版/海外版/特定入口），它们都应该保留，不可合并或覆盖。

---

## 工作流程

### 1. 抓取站点信息

用 `fetch_webpage` 获取目标 URL 的页面内容，提取：

- **name**：站点的简短名称（英文品牌名优先，中文名次之）
- **description**：简要了解其功能类别，用于后续选择 `pilot_type`
- **favicon**：优先使用 `https://<domain>/favicon.ico`；若已知有更好的图标 URL（如 CDN 地址），也可使用

### 2. 查询现有数据，避免重复

```sql
-- 检查是否已有完全相同的 link（精确匹配）
SELECT id, name, link FROM pilot WHERE link = '<目标URL>';
```

- 若 **link 完全一致** → 告知用户已存在，询问是否需要更新字段（如 img、pilot_type），**不自动插入**
- 若 **link 不同但 name 相同** → 属于不同入口，**正常插入**，插入后展示所有同名记录供用户确认

### 3. 查询 pilot_type 字典

```sql
SELECT value, label FROM dictionary WHERE type_key = 'pilot_type' ORDER BY value + 0;
```

当前类型参考（可能随项目更新）：

| value | label |
|---|---|
| 1 | 社区论坛 |
| 2 | 工具 |
| 3 | 大模型 |
| 4 | 智能体 |
| 5 | 技术博客 |
| 6 | 官方技术 |
| 7 | 网盘 |
| 8 | 开发者平台 |
| 9 | 培训/课程/机构 |
| 10 | 云服务 |
| 11 | UI设计 |
| 12 | 研究机构 |
| 13 | 图片处理 |
| 14 | 文档处理 |
| 15 | MCP |

根据站点功能选择最匹配的 `pilot_type`，不确定时告知用户并请其确认。

> ⚠️ **本表以数据库实际值为准，已于 2026-10-03 全量校准。**
> 用 `mysql --default-character-set=utf8mb4` 查，否则中文 label 会显示成乱码，
> 容易误以为字典坏了。实时查询：
> ```sql
> SELECT value, label FROM dictionary WHERE type_key='pilot_type' ORDER BY value+0;
> ```
> 智能体（4）是 coding agent / AI 助手类的正确归类 —— Cline、Cursor、Trae、Qoder、
> CodeBuddy、omp 都在这一类。别再往「工具」(2) 或「网盘」(7) 里塞。

### 4. 执行插入

```sql
INSERT INTO pilot (name, link, img, pilot_type, page_view, delete_flag, create_time, update_time)
VALUES ('<name>', '<link>', '<img>', <pilot_type>, 0, 0, NOW(), NOW());
```

### 5. 验证并汇报

```sql
SELECT id, name, link, img, pilot_type FROM pilot WHERE link = '<目标URL>';
```

向用户展示插入结果，包含 id 和所有字段。

---

## 数据库连接

```
mysql -u root -p123456 education
```

---

## 注意事项

- **不要** 因为 name 相同就跳过或删除已有记录
- `page_view` 初始值为 `0`，`delete_flag` 为 `0`
- `img` 优先使用站点自身的 favicon；AI 工具类可考虑使用 lobehub icons CDN
- **失效图标替换**：curl 在本机网络常对目标站/图标 CDN 超时或被重置，不要只依赖 curl 判断；用 WebFetch 抓站点主页，提取页面实际使用的 logo URL（如站点把 logo 放在第三方稳定 CDN 上，直接采用该官方 logo），并用 WebFetch 访问图片 URL 确认可加载。API 中转/代理类站点归类为 **8 开发者平台**，不要归到「工具」或「技术博客」。
- 若用户提供的 URL 含查询参数（如 `?index=1`），保留完整 URL，不要截断
