---
name: bilibili-video-to-article
description: 从 B 站视频链接（含分P）提取字幕或音频并转写，最终整理成结构化 Markdown 文章。当用户给出 bilibili.com 视频链接并要求"转录成文字/整理成文章/做笔记"时使用。
---

# Bilibili 视频转文章

把一个 B 站视频（支持多 P 中的某一 P）的内容变成一篇结构化 Markdown 文章。

## 输入

- B 站视频 URL，可能带 `?p=N` 分 P 参数（不带 `p` 默认第 1P）。
- 例：`https://www.bilibili.com/video/BV1d14y1H7nz/?p=9`

## 流程

### 1. 解析视频信息（不发请求体过大的页面HTML时优先用 API）

- 从 URL 提取 `bvid`（如 `BV1d14y1H7nz`）和 `p`（默认 1）。
- 调用公开接口拿分 P 列表与 cid：
  ```
  https://api.bilibili.com/x/web-interface/view?bvid=<bvid>
  ```
  响应 `data.pages[]` 中按 `page` 字段匹配第 N P，取其 `cid` 和 `part`（分P标题）。
- 请求需带浏览器 UA，否则可能 412/403：
  ```
  User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ...
  Referer: https://www.bilibili.com/
  ```

### 2. 优先取官方字幕

- 玩家信息接口：
  ```
  https://api.bilibili.com/x/player/wbi/v2?bvid=<bvid>&cid=<cid>
  ```
  （旧接口 `x/player/v2` 也可能可用）
- 检查 `data.subtitle.subtitles[]`：
  - 非空：取 `subtitle_url`（注意是 `//` 开头协议相对地址，补 `https:`），直接 GET 得到 JSON 字幕（body 内含时间轴+文本）。→ 走"官方字幕"路径，质量最高。
  - 为空（很多 UP 主未上传字幕、AI 字幕未开放）：进入第 3 步音频转写回退路径。

### 3. 回退：下载音频并本地转写

1. 拿音频流地址：
   ```
   https://api.bilibili.com/x/player/playurl?bvid=<bvid>&cid=<cid>&fnval=16
   ```
   - `fnval=16` 请求 DASH 格式；从 `data.dash.audio[]` 取 `baseUrl`（选 `bandwidth` 较低的那条即可，转写不需要高码率）。
   - 下载时必须带 `Referer: https://www.bilibili.com/` 和浏览器 UA，否则 403。
2. 落盘建议（在工作目录建子目录）：
   - `p<N>-audio.m4s`（原始音频）
   - `p<N>-audio.wav`（转 ffmpeg 转 wav 16k 单声道：`ffmpeg -i in.m4s -ar 16000 -ac 1 out.wav`）
3. 转写：
   - 优先本机已安装的 `whisper`（CLI 或 Python 包），模型可用 `small`/`medium` 平衡速度与质量。
   - 输出 `.txt`（纯文本）、`.srt` / `.vtt`（带时间轴，方便回溯定位）。
   - 长音频注意：whisper 单次跑整段即可；若超时，可按 srt 分段或后台运行并用 `bash_output` 轮询。

### 4. 清洗与整理成文章

- ASR 转写常见错误要校正：
  - 技术术语：`solivity→Solidity`、`store/retrieve`、`uint256`、`memory`、`Remix`、`storage` 等，按视频主题领域修正。
  - 中英混杂、口癖、重复语气词去除，但不要改写原意。
- 整理成文章结构：
  - 标题（用分 P 标题）
  - 内容概述（2-3 句）
  - 按主题分节的正文（保留关键代码、命令、术语）
  - 要点总结
  - 来源说明：注明"基于官方字幕"或"基于音频自动转写（ASR）"，并给出原视频链接与分 P 信息。
- 输出文件命名：`<主题-slug>-article.md`，如 `erc20-contract-basics-article.md`。

### 5. 交付

- 文章 `.md` 为核心交付物。
- 中间产物（txt/srt/vtt/wav/m4s）保留在同目录，方便用户回溯校对。
- 明确告知用户证据层级：官方字幕 > AI 字幕 > 本地 ASR 转写，不要把转写稿说成官方字幕。

## 常见坑

| 坑 | 处理 |
|---|---|
| API/下载返回 412 | 补浏览器 UA + Referer 请求头 |
| `subtitle.subtitles` 为空 | 不是失败，走音频转写回退 |
| `subtitle_url` 以 `//` 开头 | 手动补 `https:` |
| `playurl` 返回 `durl`（老FLV）而非 `dash` | 加 `fnval=16`，或用 yt-dlp（注意 B 站可能对 yt-dlp 返回 412，API 直连更稳） |
| 页面 HTML 里没有嵌入 `window.__playinfo__` | 不要死磕页面解析，直接走 API |
| whisper 转写长时间无返回 | 后台运行 + 轮询，或换更小模型 |
| 音频文件时长 | 用 `ffprobe` 确认后再估算转写耗时 |

## 快速命令参考

```bash
# 分P信息（取cid）
curl -s -H "User-Agent: Mozilla/5.0" \
  "https://api.bilibili.com/x/web-interface/view?bvid=BV1d14y1H7nz" | jq '.data.pages'

# 字幕轨道检查
curl -s -H "User-Agent: Mozilla/5.0" \
  "https://api.bilibili.com/x/player/wbi/v2?bvid=<bvid>&cid=<cid>" | jq '.data.subtitle'

# 音频流（DASH）
curl -s -H "User-Agent: Mozilla/5.0" \
  "https://api.bilibili.com/x/player/playurl?bvid=<bvid>&cid=<cid>&fnval=16" \
  | jq '.data.dash.audio[0].baseUrl'

# 下载（必须带 Referer）
curl -s -H "User-Agent: Mozilla/5.0" -H "Referer: https://www.bilibili.com/" \
  -o p9-audio.m4s "<baseUrl>"

# 转码 + 转写
ffmpeg -y -i p9-audio.m4s -ar 16000 -ac 1 p9-audio.wav
whisper p9-audio.wav --model small --output_format all --language zh
```
