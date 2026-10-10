/* 头条号发文 playbook —— 由 toutiao-publish SKILL.md（实测 2026-07）的选择器逐条移植为确定性代码，运行期无 LLM 参与。
   bridge 会注入 ARGS：{ file, mode:'draft'|'publish', title?, tags?:[], category?, summary?, cover? }
   事实来源：/Users/javaedge/soft/VSProjects/project-launcher/projects/md-publish/skills/toutiao-publish/SKILL.md
   （2026-10 从 ~/.agents/skills/toutiao-publish 迁入，原目录已删；下文注释中的 L<行号> 均指该文件，
    该文件只在末尾追加过订正、行号未变动）
   已知差异：skill 里的 tags/category/summary 在头条发布页没有实测过的填法 → 一律跳过并 note，不硬填。
   平台口径（2026-10-06 定）：头条只到草稿箱，最终提交人工点 —— 封面必填而「无封面」选项在本版 UI 切不动，
   且封面上传入口在 DOM 里找不到 input[type=file]（详见第 7 节的四条实测）。mode=publish 也只做到落盘核验，不点提交。 */
/*ARGS_TOKEN__*/
const { readFileSync, existsSync } = await import('node:fs');

const PLATFORM = 'toutiao';
const SPACE = 'mdps toutiao';
/* 用户可能在 Ego Lite 里接管了上次的任务空间（ownership:user），ego 会硬暂停所有命令。
   不抢回控制权，直接另开一个唯一命名的新空间，保证桥不会被上一次人工浏览卡死。 */
let SPACE_USED = SPACE;
async function openSpace() {
  let name = SPACE;
  try {
    const ss = await listTaskSpaces();
    if ((ss || []).some(s => s.name === SPACE && s.ownership === 'user')) {
      name = SPACE + ' ' + Date.now();
      step('note', '上次的任务空间被你接管了，改用新空间 ' + name);
    }
  } catch (e) { /* 探测失败就用默认名 */ }
  const t = await useOrCreateTaskSpace(name);
  SPACE_USED = name;
  return t;
}

const EDITOR = 'https://mp.toutiao.com/profile_v4/graphic/publish';      // L72
const DRAFT_MGR = 'https://mp.toutiao.com/profile_v4/manage/draft';      // L247
// 2026-10-05 实测：作品管理（含审核中/已发布）在 /profile_v4/manage/content/all；草稿箱只放没提交出去的东西，
// 所以「进草稿箱」绝不能当发布成功判据——旧版就是栽在这儿，空草稿也进草稿箱。
const CONTENT_ALL = 'https://mp.toutiao.com/profile_v4/manage/content/all';
const TITLE_SEL = 'textarea[placeholder="请输入文章标题（2～30个字）"]';   // L115（自定义组件内部 textarea，L25）

/* Markdown → 可粘贴 HTML。头条编辑器是 ProseMirror 富文本，不吃 Markdown：
   直接把 `## 标题`、`- 列表`、`**加粗**` 当纯文本贴进去，发出去就是一堆原始记号。
   纯本地确定性转换（无依赖、无 LLM），覆盖文章里会出现的记号：标题/有序无序列表/引用/
   代码块/分割线/表格行（降级成段落）/粗斜体/行内代码/链接。 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mdInline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/~~([^~]+)~~/g, '<del>$1</del>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
function mdToHtml(md) {
  const lines = String(md).replace(/\r\n/g, '\n').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u200b\u2060\ufeff]/g, '').split('\n');
  const out = [];
  let list = null, fence = false, fenceBuf = [];
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (fence) {
      if (/^```/.test(line)) { out.push('<pre>' + esc(fenceBuf.join('\n')) + '</pre>'); fence = false; fenceBuf = [] }
      else fenceBuf.push(line);
      continue;
    }
    if (/^```/.test(line)) { closeList(); fence = true; continue }
    if (!line.trim()) { closeList(); continue }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const lv = Math.min(Math.max(h[1].length, 2), 4); out.push('<h' + lv + '>' + mdInline(h[2]) + '</h' + lv + '>'); continue }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul' } out.push('<li>' + mdInline(ul[1]) + '</li>'); continue }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol' } out.push('<li>' + mdInline(ol[1]) + '</li>'); continue }
    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) { closeList(); out.push('<blockquote>' + mdInline(bq[1]) + '</blockquote>'); continue }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) { closeList(); out.push('<hr>'); continue }
    if (/^\s*\|/.test(line)) { closeList(); out.push('<p>' + mdInline(line.replace(/\|/g, ' ').replace(/-+/g, '')) + '</p>'); continue }
    closeList();
    out.push('<p>' + mdInline(line) + '</p>');
  }
  closeList();
  if (fence) out.push('<pre>' + esc(fenceBuf.join('\n')) + '</pre>');
  return out.join('\n');
}
// HTML → 期望页面能读到的纯文本（用来跟 ProseMirror 回读的内容逐字核对）
const htmlToPlain = (html) => String(html)
  .replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

const step = (k, v) => console.log(`[${PLATFORM}] ${k}${v === undefined ? '' : ': ' + (typeof v === 'string' ? v : JSON.stringify(v))}`);
const fail = (msg) => { step('FAILED', msg); throw new Error(PLATFORM + ': ' + msg) };
/* Ego Lite 窗口被最小化/隐藏时，ego 的 captureScreenshot 会抛「Cannot take screenshot with 0 width」。
   截图只是留证，绝不能把已经点下去的发布动作判成失败 —— 统一走 shot()，失败只记一行 warn。 */
async function shot(tag) {
  try { await captureScreenshot(); return 'shot' }
  catch (e) { step('warn', '截图失败' + (tag ? '（' + tag + '）' : '') + '：' + String(e.message || e).split('\n')[0]); return 'no-shot' }
}

// 往页面脚本里塞值一律走 sub()，不用 String.replace：值里的 $& / $1 会被当成特殊替换序列
const sub = (tpl, token, val) => tpl.split(token).join(String(val));

/* ---------- 1. 解析文章（L92-98） ---------- */
if (!ARGS.file || !existsSync(ARGS.file)) fail('文章文件不存在: ' + ARGS.file);
const raw = readFileSync(ARGS.file, 'utf8');
let body = raw, fm = {};
const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
if (fmMatch) {
  body = raw.slice(fmMatch[0].length);
  for (const line of fmMatch[1].split('\n')) {
    const m = line.match(/^\s*([A-Za-z_]+)\s*:\s*(.+?)\s*$/);
    if (m) fm[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
  }
}
let title = (ARGS.title || fm.title || (body.match(/^\s*#\s+(.+)$/m) || [])[1]
  || ARGS.file.split('/').pop().replace(/\.(md|markdown|txt)$/i, '')).trim();
// 标题长度校验：2-30 字，超出截断（L34 / L97 / L109）
if (title.length > 30) { step('note', `标题超长已截断为 30 字: ${JSON.stringify(title)}`); title = title.slice(0, 30) }
if (title.length < 2) fail('标题不足 2 字，头条号不允许发布: ' + JSON.stringify(title));
const rawTags = ARGS.tags && ARGS.tags.length ? ARGS.tags
  : (fm.tags || '').replace(/[\[\]]/g, '').split(/[,，]/).map(x => x.trim()).filter(Boolean);
const category = ARGS.category || fm.category || '';
const summary = ARGS.summary || fm.summary || '';
const cover = ARGS.cover || fm.cover || '';
const localImgs = (body.match(/!\[[^\]]*\]\((?!https?:)[^)]+\)/g) || []).length;
step('meta', { title, mode: ARGS.mode, chars: body.replace(/\s+/g, '').length, localImgs });
if (localImgs) step('note', `正文含 ${localImgs} 张本地图片，平台拉不到，发布后需手动补图`);
// SKILL.md 未实测头条的标签/分类/摘要填法 → 只记录，不填写，避免把值写进别的输入框
if (rawTags.length || category) step('note', '头条 playbook：tags/category SKILL.md 无实测选择器，跳过填写');
if (summary) step('note', '头条 playbook：摘要 SKILL.md 无实测选择器，跳过填写');

/* ---------- 2. 打开发布页 + 登录检测（Step 1-2, L69-89） ---------- */
const task = await openSpace();
try {
  await openOrReuseTab(EDITOR, { wait: true, timeout: 35 });
} catch (e) { fail('打开发布页超时: ' + e.message) }
await wait(3);
const info = await pageInfo();
if (!/mp\.toutiao\.com/.test(info.url)) fail('未停在头条号发布页: ' + info.url);
// 登录态判据（L86-88）：标题 textbox 存在＝已登录；悬浮 AI 助手 textbox（L33）不影响，忽略
const ready = await js(sub(String.raw`!!document.querySelector('__TITLE_SEL__')`, '__TITLE_SEL__', TITLE_SEL));
if (!ready) fail('未登录或改版：找不到标题输入框 textarea[placeholder="请输入文章标题（2～30个字）"]（当前 ' + info.url + '）');
step('editor', info.url);

/* ---------- 3. 填标题（Step 4, L103-123） ---------- */
// 主路径 fillInput；未生效则按 skill 的 JS 兜底：直接 ta.value + dispatch input/change（L111-123）
await fillInput(TITLE_SEL, title);
await wait(1);
let gotTitle = await js(sub(String.raw`(() => {
  const ta = document.querySelector('__TITLE_SEL__');
  return ta ? ta.value : '__MISS__';
})()`, '__TITLE_SEL__', TITLE_SEL));
if (gotTitle !== title) {
  step('title retry', 'fillInput 未生效，改用 JS 直写（skill L114-122）');
  const titleB64 = Buffer.from(title, 'utf8').toString('base64');
  await js(sub(sub(String.raw`(() => {
    const t = new TextDecoder().decode(Uint8Array.from(atob("__TB64__"), c => c.charCodeAt(0)));
    const ta = document.querySelector('__TITLE_SEL__');
    if (!ta) return 'no-textarea';
    ta.value = t;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    return 'set:' + ta.value.length;
  })()`, '__TB64__', titleB64), '__TITLE_SEL__', TITLE_SEL));
  await wait(1);
  gotTitle = await js(sub(String.raw`(() => {
    const ta = document.querySelector('__TITLE_SEL__');
    return ta ? ta.value : '__MISS__';
  })()`, '__TITLE_SEL__', TITLE_SEL));
}
if (gotTitle !== title) fail('标题写入不一致: ' + JSON.stringify(gotTitle));
step('title ok', gotTitle);

/* ---------- 4. 写正文（2026-10-05 重写：paste HTML，不再直接改 DOM） ----------
   旧版按 skill 的「createElement + appendChild 塞进 .ProseMirror」写正文，页面回读、非空校验全过，
   但 ProseMirror 的文档模型没被碰过——头条自动保存把一条**空草稿**存进了草稿箱，
   直发点了「发布」也只是又存了一次空草稿（当时的判据只看草稿箱有没有标题，所以误报 PUBLISH_OK）。
   实测通道是 paste：给 .ProseMirror 派发 ClipboardEvent(text/html)，事件被 defaultPrevented
   ＝编辑器自己接管了，内容进模型，字数条随之从 0 字变正数。 */
const htmlBody = mdToHtml(body);
const plainBody = htmlToPlain(htmlBody);
const wantNonWs = plainBody.replace(/\s+/g, '');
const headNeedle = wantNonWs.slice(0, 20);
const tailNeedle = wantNonWs.slice(-20);
const pasteTpl = sub(String.raw`(() => {
  const h = decodeURIComponent(escape(atob("__HB64__")));
  let pm = document.querySelector('.syl-editor .ProseMirror');
  if (!pm) {
    const cands = [...document.querySelectorAll('.ProseMirror')].filter(e => e.offsetParent !== null);
    if (cands.length > 1) return 'ambiguous:' + cands.length;
    pm = cands[0] || null;
  }
  if (!pm) return 'no-ProseMirror';
  pm.focus();
  try {
    const sel = window.getSelection();
    const rng = document.createRange();
    rng.selectNodeContents(pm);
    rng.collapse(false);
    sel.removeAllRanges();
    sel.addRange(rng);
  } catch (e) { /* 选区失败不影响 paste */ }
  const dt = new DataTransfer();
  dt.setData('text/html', h);
  dt.setData('text/plain', h.replace(/<[^>]+>/g, '\n'));
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  pm.dispatchEvent(ev);
  return 'pasted:' + (ev.defaultPrevented ? 'handled' : 'ignored') + ':' + (pm.innerText || '').length;
})()`, '__HB64__', Buffer.from(htmlBody, 'utf8').toString('base64'));

// 编辑器可能还没挂载完（skill L322：ProseMirror 未找到＝未加载完），最多重试 5 次
let wrote = '';
for (let attempt = 1; attempt <= 5; attempt++) {
  wrote = await js(pasteTpl);
  if (String(wrote).startsWith('pasted:handled')) break;
  step('body attempt ' + attempt, wrote);
  await wait(4);
}
if (String(wrote).startsWith('ambiguous')) fail('页面有多个可见 .ProseMirror 且没有 .syl-editor 定位，为避免写错框而中止: ' + wrote);
if (!String(wrote).startsWith('pasted:handled')) fail('正文粘贴未被编辑器接管（paste 返回 ' + wrote + '），内容不会进文档模型，已中止');
await wait(2);

/* 回读校验：跟「转换后 HTML 的纯文本」逐字比，而不是跟原始 Markdown 比
   （Markdown 记号本来就该在转换中消失，页面里出现 ## 或 ** 反而是坏事）。 */
const verify = await js(String.raw`(() => {
  let pm = document.querySelector('.syl-editor .ProseMirror') || document.querySelector('.ProseMirror');
  if (!pm) return { nonWs: -1, head: '', tail: '', words: '', mdLeft: '' };
  const t = (pm.innerText || '').replace(/\s+/g, '');
  return {
    nonWs: t.length,
    head: t.slice(0, 20),
    tail: t.slice(-20),
    words: (document.body.innerText.match(/[\d,]+\s*字/) || [''])[0],
    mdLeft: (pm.innerText || '').indexOf('## ') !== -1 ? '页面仍残留 Markdown 标题记号' : ''
  };
})()`);
if (verify.mdLeft) step('warn', verify.mdLeft);
const okHead = wantNonWs.indexOf(verify.head) !== -1 && verify.head.length > 0;
const okTail = verify.tail === tailNeedle;
if (verify.nonWs < wantNonWs.length * 0.9 || !okHead || !okTail) {
  fail('正文回读与期望不符（页面 ' + verify.nonWs + ' / 期望 ' + wantNonWs.length +
    '，head 命中=' + okHead + ' tail 命中=' + okTail + '）' + JSON.stringify(verify));
}
step('body ok', Object.assign({ via: 'paste(text/html)', expect: wantNonWs.length }, verify));

/* ---------- 5. 封面设为「无封面」（Step 6, L40-63 / L175-222） ---------- */
// 必须 click label（className 恰为 byte-radio）触发 Vue 组件，不能动 radio input；
// 状态验证看 label > input.checked 与 .byte-radio-inner class 含 checked（L28-29）。
if (cover && existsSync(cover)) {
  // 实测（2026-10-06）：ego 的 uploadFile(sel, path) 要求 sel 命中 input[type=file]，而点封面「+」(.article-cover-add) 后
  // 全页 input[type=file] 数量为 0（既不是动态 input 也抓不到），没有实测入口就不硬闯 → 仍按「无封面」走，封面留人工。
  step('note', `ARGS.cover=${cover}：头条封面上传入口未实测到 input[type=file]，脚本不猜选择器，请人工在草稿里上传这张图`);
}
const coverRes = await js(String.raw`(() => {
  const labels = document.querySelectorAll('label');
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l.className === 'byte-radio' && l.offsetParent !== null) {
      const span = l.querySelector('span');
      if (span && span.innerText && span.innerText.indexOf('无封面') !== -1) {
        l.click();
        const input = l.querySelector('input');
        const inner = l.querySelector('.byte-radio-inner');
        return 'clicked: inputChecked=' + (input ? input.checked : 'no-input') +
          ' innerHasChecked=' + (inner ? inner.className.indexOf('checked') !== -1 : 'no-inner');
      }
    }
  }
  return 'not-found';
})()`);
await wait(1);
step('cover click', coverRes);
if (coverRes === 'not-found') step('warn', '找不到「无封面」label（byte-radio），封面跳过——头条默认可能已是无封面');
// 复核（L199-222）：应看到 无封面: input=true inner=true
const coverState = await js(String.raw`(() => {
  const results = [];
  const labels = document.querySelectorAll('label');
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l.className === 'byte-radio' && l.offsetParent !== null) {
      const span = l.querySelector('span');
      if (span) {
        const text = span.innerText.trim();
        if (text === '单图' || text === '三图' || text === '无封面') {
          const input = l.querySelector('input');
          const inner = l.querySelector('.byte-radio-inner');
          results.push(text + ': input=' + (input ? input.checked : '?') + ' inner=' + (inner ? inner.className.indexOf('checked') !== -1 : '?'));
        }
      }
    }
  }
  return results;
})()`);
step('cover state', coverState);
// 实测（2026-10-06）：input.checked 会被 label.click() 改到「无封面」，但 Vue 状态位 .byte-radio-inner.checked 一直留在「单图」，
// 提交时页面报 <p class="err-tip-cover">请完成封面图设置</p> —— 所以 inner=true 才是真状态，input=true 只是原生 radio 的假象。
if (!coverState.some(s => /无封面: input=true inner=true/.test(s))) step('warn', '封面没能切到「无封面」（inner 仍是 false）：头条这版 UI 封面必填，脚本不猜上传入口，留给人工补封面');

/* ---------- 5.5 落盘复核（2026-10-05 补，就是这条抓到了「草稿是空的」） ----------
   自动保存把编辑器模型写成服务端草稿，URL 会带上 ?pgc_id=<id>。等到位后**重新打开一次**这条草稿，
   从服务端回读标题和正文：只有这一步过了，后面「进草稿箱」「提交审核」才是有内容的动作。
   旧版没有这一步，所以页面校验全绿、草稿箱却有货，打开是空的。 */
let pgcId = '';
for (let i = 0; i < 12; i++) {
  const u = (await pageInfo()).url;
  const m = u.match(/pgc_id=(\d+)/);
  if (m) { pgcId = m[1]; break }
  await wait(3);
}
step('autosave', pgcId ? 'pgc_id=' + pgcId : 'URL 一直没出现 pgc_id，等 3 秒后按当前页面复核');
if (!pgcId) await wait(3);
const reloadUrl = pgcId ? EDITOR + '?pgc_id=' + pgcId : (await pageInfo()).url;
await openOrReuseTab(reloadUrl, { wait: true, timeout: 40 }).catch(e => step('warn', '重开草稿失败: ' + e.message.split('\n')[0]));
await wait(9);
const persisted = await js(sub(String.raw`(() => {
  const ta = document.querySelector('__TITLE_SEL__');
  const pm = document.querySelector('.syl-editor .ProseMirror') || [...document.querySelectorAll('.ProseMirror')].filter(e => e.offsetParent !== null)[0];
  return {
    url: location.href,
    title: ta ? (ta.value || '') : '__NO-TITLE-FIELD__',
    bodyNonWs: pm ? (pm.innerText || '').replace(/\s+/g, '').length : -1,
    words: (document.body.innerText.match(/[\d,]+\s*字/) || [''])[0]
  };
})()`, '__TITLE_SEL__', TITLE_SEL));
step('persist check', persisted);
if (!persisted.title || persisted.title.indexOf(title.slice(0, 8)) === -1) {
  fail('重开草稿后标题不在（读到 ' + JSON.stringify(persisted.title) + '）——头条这次保存没落盘，后面别再点发布');
}
if (persisted.bodyNonWs < 40) {
  fail('重开草稿后正文是空的（非空白字符 ' + persisted.bodyNonWs + '，' + persisted.words + '）——内容没进头条的文档模型，草稿是空壳');
}
step('persisted ok', { title: persisted.title, bodyNonWs: persisted.bodyNonWs, words: persisted.words });


/* ---------- 6. 发布前状态汇总 ---------- */
step('ready', await js(sub(String.raw`(() => {
  const ta = document.querySelector('__TITLE_SEL__');
  const pm = document.querySelector('.syl-editor .ProseMirror') || document.querySelector('.ProseMirror');
  return {
    title: ta ? ta.value : null,
    bodyLen: pm ? pm.innerText.replace(/\s+/g, '').length : -1,
  };
})()`, '__TITLE_SEL__', TITLE_SEL)));

/* ---------- 7. 一律停在草稿箱，最终提交由人工点（2026-10-06 实测结论，别再试自动直发） ----------
   为什么头条不做自动直发，四条全是实测、不是猜：
   1) 点「预览并发布」被页面静默拦住 —— MutationObserver 抓到一闪而过的 <p class="err-tip-cover">请完成封面图设置</p>，这版 UI 封面必填；
   2) 「无封面」切不动 —— 真实鼠标点 label、点内层 .byte-radio-inner、点文字、完整 pointer 事件序列、input.click()+change、键盘空格，
      六种方式全都只改到原生 radio 的 checked，Vue 状态位 .byte-radio-inner.checked 一直停在「单图」，「无封面」形同摆设；
   3) 上传封面走不通 —— ego 的 uploadFile(sel, path) 要求 sel 命中 input[type=file]，而点封面区的「+」(.article-cover-add) 之后
      整个 DOM 里 input[type=file] 数量为 0；没有实测过的上传入口就不猜选择器；
   4) skill 记的「预览弹窗里有发布按钮」已过期 —— 点「预览」只出手机二维码预览（.preview-article-wrap，文案「仅支持预览」）。
   所以脚本做到「标题 + 正文 + 落盘核验」为止，人工只剩两步：补封面 → 点「预览并发布」。 */
let savedTip = 'not-seen';
for (let i = 0; i < 8; i++) {
  savedTip = await js(String.raw`(() => /草稿已保存/.test(document.body.innerText || '') ? 'seen' : 'not-seen')()`);
  if (savedTip === 'seen') break;
  await wait(2);
}
step('autosave tip', savedTip);   // 实测：自动保存会落盘，但 URL 不一定出现 pgc_id，所以只信这条文案 + 草稿箱回读
if (savedTip !== 'seen') step('warn', '没看到「草稿已保存」提示，稍后以草稿箱回读结果为准');

// 核验（2026-10-05 实测）：草稿箱地址是 /profile_v4/manage/draft；/manage/content/draft 是只渲染侧栏的空壳，别用
await openOrReuseTab(DRAFT_MGR, { wait: true, timeout: 35 }).catch(e => step('warn', '打不开草稿箱: ' + e.message.split('\n')[0]));
await wait(4);
const inBox = await js(sub(String.raw`(() => {
  const t = decodeURIComponent(escape(atob("__TB64__")));
  const needle = t.slice(0, 10);
  const rows = [...document.querySelectorAll('.article-draft-item')].map(r => (r.innerText || '').replace(/\s+/g, ' ').trim());
  const mine = rows.filter(r => r.indexOf(needle) !== -1);
  return { hit: mine.length > 0, n: mine.length, newest: mine[0] || '',
           total: ((document.body.innerText || '').match(/共 ?[\d,]+ ?条/) || [''])[0], url: location.href };
})()`, '__TB64__', Buffer.from(title, 'utf8').toString('base64')));
step('draft check', inBox);
if (!inBox.hit) {
  await shot('草稿箱没见到本文');
  fail('草稿箱里没有这篇文章（' + DRAFT_MGR + '，' + (inBox.total || '列表为空') + '）——头条的自动暂存没接管，草稿不算成功');
}
if (inBox.n > 1) step('warn', '草稿箱里同标题的稿子有 ' + inBox.n + ' 条（自测留下的重复稿），发布前只留最新那条，其余删掉');
step('result', 'DRAFT_OK');
step('link', DRAFT_MGR);
step('manual', (ARGS.mode === 'publish' ? '已按要求走到发布环节，但头条不自动提交：' : '草稿模式：')
  + '打开 ' + DRAFT_MGR + ' → 编辑《' + title + '》→ 补封面（必填，无封面选项在本版 UI 失效）→ 点「预览并发布」。'
  + '提交后可在 ' + CONTENT_ALL + ' 核对状态');
await completeTaskSpace(SPACE_USED, { keep: true }).catch(() => {});   // 留标签页给人补封面
step('done', 'ok');
