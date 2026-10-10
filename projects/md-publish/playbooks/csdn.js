/* CSDN 发文 playbook —— 由 csdn-publish skill 的实测选择器逐条移植（skill 原文是 bb-browser 写法，
   SKILL.md 路径：skills/csdn-publish/SKILL.md（项目内，2026-10 从 ~/.agents/skills 迁入）；
   这里全部翻译成 ego-browser API：open→openOrReuseTab、eval→js(String.raw`...`)、snapshot -i→js DOM 探测、
   fill/press→js native setter；bb-browser 的 wait 单位是毫秒，本文件 wait()/timeout 一律用「秒」）。
   纯确定性执行，无 LLM 参与。skill 没写明的选择器一律不编造：确需泛化探测处标 TODO 待实测，
   探测失败就 step('warn', ...) 软跳过，不硬闯。
   bridge 会注入 ARGS：{ file, mode:'draft'|'publish', title?, tags?:[], category?, summary?, cover? } */
/*ARGS_TOKEN__*/
const { readFileSync, existsSync } = await import('node:fs');

const PLATFORM = 'csdn';
const SPACE = 'mdps csdn';
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

const EDITOR = 'https://editor.csdn.net/md/';   // skill 第 10 行：CSDN Markdown 编辑器地址
const step = (k, v) => console.log(`[${PLATFORM}] ${k}${v === undefined ? '' : ': ' + (typeof v === 'string' ? v : JSON.stringify(v))}`);
const fail = (msg) => { step('FAILED', msg); throw new Error(PLATFORM + ': ' + msg) };
/* Ego Lite 窗口被最小化/隐藏时，ego 的 captureScreenshot 会抛「Cannot take screenshot with 0 width」。
   截图只是留证，绝不能把已经点下去的发布动作判成失败 —— 统一走 shot()，失败只记一行 warn。 */
async function shot(tag) {
  try { await captureScreenshot(); return 'shot' }
  catch (e) { step('warn', '截图失败' + (tag ? '（' + tag + '）' : '') + '：' + String(e.message || e).split('\n')[0]); return 'no-shot' }
}

// 往页面脚本里塞值一律走 sub()，不用 String.replace：值里的 $& / $1 会被当成特殊替换序列。
// 且一切文本都 base64 后在页内解码（对应 skill 第 74 条「含中文/正则/模板字符串的 JS 别裸拼」的教训）。
const sub = (tpl, token, val) => tpl.split(token).join(String(val));
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const DECODE = (token) => `new TextDecoder().decode(Uint8Array.from(atob("${token}"), c => c.charCodeAt(0)))`;
// skill 第 12 条：正文校验必须用 textContent（innerText 会被 cledit 高亮层虚增几十字，实测 2987 vs 3032）
/* 正文一致性校验用的归一化。两类差异是编辑器自己会做的，不代表写坏了：
   ① 结尾 1~2 个换行（skill 实测）；
   ② CSDN 的 cledit 会把 NBSP 等 Unicode 空格落成普通空格、吃掉零宽字符（2026-10-05 实测：
      一篇含 198 个 U+00A0 的稿件，页面与源文本长度相同但第 17 个字符起就不等，
      逐字符比对会误判成「写入失败」，而实际内容完好）。
   除这些之外仍要求逐字符相等，真被截断/串文照样拦得住。 */
const norm = (s) => String(s)
  .replace(/\r\n/g, '\n')
  .replace(/[\u00a0\u2007\u202f]/g, ' ')
  .replace(/[\u200b\u2060\ufeff]/g, '')
  .replace(/\s+$/, '');

/* ---------- 1. 解析文章 ---------- */
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
// 标题：frontmatter.title → 首个 # 一级标题 → 文件名清洗；skill 元数据规则：长度 5~100 字，超长截断
let title = (ARGS.title || fm.title || (body.match(/^\s*#\s+(.+)$/m) || [])[1]
  || ARGS.file.split('/').pop().replace(/\.(md|markdown|txt)$/i, '')).trim().replace(/\s+/g, ' ');
if (title.length > 100) { title = title.slice(0, 100); step('note', '标题超 100 字，已截断'); }
if (title.length < 5) step('warn', `标题只有 ${title.length} 字（CSDN 要求 5~100），可能被拦`);

// 分类专栏（skill 决策规则第 112 行）：只从「抽屉里已有的专栏」精确匹配一个；
// 没有指定或没匹配就留空——「后端」只是内部兜底判断，绝不代表要创建/选择一个叫"后端"的专栏。
// CSDN 无受控分类词表可自动推断（skill 未给关键词判据，不编造），故不做掘金式关键词打分。
const category = (ARGS.category || fm.category || '').trim();

// 标签：≤5 个、≥1 个（skill：CSDN 自定义标签可加，不要求命中受控词表）
const rawTags = (ARGS.tags && ARGS.tags.length ? ARGS.tags
  : (fm.tags || '').replace(/[\[\]]/g, '').split(/[,，]/).map(x => x.trim()).filter(Boolean)).slice(0, 5);
const tagList = rawTags;
if (!tagList.length) step('warn', '没有可用标签（skill 要求至少 1 个），到抽屉里将跳过标签步骤');
const summary = ARGS.summary || fm.summary || '';
const cover = ARGS.cover || fm.cover || '';

// 本地图片：只提示不阻断（bb-browser 时代本地图传不进；ego 有 uploadFile 但封面 input 选择器 skill 未实测）
const localImgs = (body.match(/!\[[^\]]*\]\((?!https?:)[^)]+\)/g) || []).length;
if (localImgs) step('note', `正文含 ${localImgs} 张本地图片，CSDN 拉不到，发布后需手动补图`);
// 外链图片列表（skill 实测发现第 6 条：不预转存就会留下「外链图片转存失败」占位符）
const extImgs = [...new Set([...body.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)[^)]*\)/g)].map(m => m[1]))];
step('meta', { title, category, tags: tagList, mode: ARGS.mode, chars: body.replace(/\s+/g, '').length, localImgs, extImgs: extImgs.length });

/* ---------- 2. 打开编辑器 + 登录检测 ---------- */
await openSpace();
try {
  await openOrReuseTab(EDITOR, { wait: true, timeout: 35 });
} catch (e) { fail('打开编辑器超时: ' + e.message) }
await wait(3);
let info = await pageInfo();
if (!/csdn\.net/.test(info.url)) fail('未停在 CSDN 编辑器: ' + info.url);
// skill 速查表：标题框 input.article-bar__title--input、正文 .editor__inner（cledit contenteditable，非 CodeMirror）
const hasTitle = await js(String.raw`!!document.querySelector('input.article-bar__title--input')`);
const hasBody = await js(String.raw`!!document.querySelector('.editor__inner.markdown-highlighting') || !!document.querySelector('.editor__inner')`);
if (!hasTitle || !hasBody) fail(`未登录或改版：找不到标题框/正文编辑器（当前 ${info.url}；被跳登录页就去手动登录一次再重发）`);
// 右侧 AI iframe（app-blog.csdn.net/csdn/aiChatNew）只是挂件，正文在父页，无需进 iframe（skill 第 2 条）
step('editor', info.url);

/* ---------- 3. 外链图预转存（skill 实测发现第 6 条：注入前自己调官方接口换 URL） ---------- */
async function transferExternalImgs() {
  if (!extImgs.length) return;
  const api = await js(String.raw`!!(window.csdn && window.csdn.upload && window.csdn.upload.transferImg)`);
  if (!api) { step('warn', 'window.csdn.upload.transferImg 不存在（改版？），外链图保持原样，可能留下转存失败占位'); return; }
  // 参数逐字来自 skill：{uniqueId, imgUrl, type:'blog', rtype:'article', isCrawler:0, nocache:2}
  // Promise.all 并发、结果写 window.__tr.map 供轮询回读（js() 按同步取值风格处理，不赌它 await Promise）
  const kick = await js(sub(String.raw`(() => {
    const urls = JSON.parse(${DECODE('__U__')});
    window.__tr = { map: {}, done: 0, total: urls.length };
    urls.forEach((u, i) => {
      const settle = (url) => { window.__tr.map[u] = url || ''; window.__tr.done++; };
      try {
        csdn.upload.transferImg({ uniqueId: 'mdps_' + Date.now() + '_' + i, imgUrl: u, type: 'blog', rtype: 'article', isCrawler: 0, nocache: 2 })
          .then(r => settle(r && r.code === 200 && r.data && r.data.url ? r.data.url : ''))
          .catch(() => settle(''));
      } catch (e) { settle(''); }
    });
    return 'started';
  })()`, '__U__', b64(JSON.stringify(extImgs))));
  step('transfer kick', kick);
  for (let i = 0; i < 15; i++) {
    const st = await js(String.raw`window.__tr ? window.__tr.done + '/' + window.__tr.total : 'gone'`);
    if (st === 'gone') { step('warn', '转存状态 window.__tr 丢失'); break; }
    const p = String(st).split('/');
    if (Number(p[0]) >= Number(p[1])) break;
    await wait(2);
  }
  let trMap = {};
  try { trMap = JSON.parse(await js(String.raw`window.__tr ? JSON.stringify(window.__tr.map) : '{}'`)); }
  catch (e) { step('warn', '读回转存结果失败: ' + e.message); return; }
  // 在本地把 md 外链替换成 i-blog.csdnimg.cn 永久地址，再走注入（split/join 替换，不用 replace）
  let ok = 0;
  for (const [oldU, newU] of Object.entries(trMap)) {
    if (newU) { body = body.split(oldU).join(newU); ok++; }
  }
  step('transfer', { total: extImgs.length, ok, failed: extImgs.length - ok });
  if (ok < extImgs.length) step('note', `${extImgs.length - ok} 张外链图转存失败，注入时会过滤「外链图片转存失败」占位行兜底`);
}
await transferExternalImgs();

// 注入前过滤坏图行（skill 第 3 步原样）：本地过滤，保证「期望正文」与注入内容一致、可比对
const finalBody = body.split('\n')
  .filter(l => l.indexOf('外链图片转存失败') === -1 && l.indexOf('img-home.csdnimg.cn') === -1)
  .join('\n');
const bodyB64 = b64(finalBody);

/* ---------- 复用步骤：填标题 / 注入正文 / 开抽屉 / 加标签 ---------- */
async function fillTitle() {
  // skill 第 4 步 + 速查表：受控组件，native setter + dispatch input/change
  const r = await js(sub(String.raw`(() => {
    const i = document.querySelector('input.article-bar__title--input');
    if (!i) return 'no-input';
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, ${DECODE('__T__')});
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`, '__T__', b64(title)));
  if (r === 'no-input') fail('未登录或改版：找不到 input.article-bar__title--input');
  await wait(1);
  const got = await js(String.raw`document.querySelector('input.article-bar__title--input')?.value || ''`);
  if (got !== title) fail('标题写入不一致: ' + JSON.stringify(got));
  step('title ok', got);
}
async function injectBody() {
  // skill 实测发现第 1 条：正文是 cledit 的 contenteditable <pre>，写入用 textContent + input/change，没有 CodeMirror
  const r = await js(sub(String.raw`(() => {
    const md = ${DECODE('__B64__')};
    const e = document.querySelector('.editor__inner');
    if (!e) return 'none';
    e.focus();
    e.textContent = md;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return 'written';
  })()`, '__B64__', bodyB64));
  if (r === 'none') fail('未登录或改版：找不到正文编辑器 .editor__inner');
  await wait(2);
}
async function readBodyText() {
  return norm(await js(String.raw`(document.querySelector('.editor__inner')?.textContent || '')`));
}
async function verifyBody(strict) {
  const want = norm(finalBody);
  const v = await readBodyText();
  const s = JSON.parse(await js(String.raw`(() => {
    const t = document.querySelector('.editor__inner')?.textContent || '';
    return JSON.stringify({ len: t.length, head: t.slice(0, 24), tail: t.slice(-24), csdnimg: (t.match(/csdnimg\.cn/g) || []).length });
  })()`));
  if (v === want) { step('body ok', s); return true; }
  if (strict) fail(`正文写入校验失败（页面 ${v.length} / 本地 ${want.length}）`);
  step('warn', `正文与期望不一致（页面 ${v.length} / 本地 ${want.length}），重注入一次`);
  await injectBody();
  const v2 = await readBodyText();
  if (v2 !== want) fail(`正文重注入后仍不一致（页面 ${v2.length} / 本地 ${want.length}）`);
  step('body ok', { repaired: true });
  return true;
}
// skill 实测发现第 10 条：标签 autocomplete / 抽屉操作可能把杂散文本串进 .editor__inner，每步前后都要复核
async function guardBody(when) {
  if ((await readBodyText()) !== norm(finalBody)) {
    step('warn', `${when}：正文被串入杂散文本，用 textContent 重注入修复（skill 第 10 条）`);
    await injectBody();
    if ((await readBodyText()) !== norm(finalBody)) fail(`${when} 后正文无法恢复`);
  }
}
async function openDrawer() {
  // skill 第 11 条：编辑页有 2 个同名「发布文章」，btn btn-publish 是真的，simulation-button 是装饰；
  // 兜底用 JS 按文案+class 取再 .click()（skill 第 10 条：click @ref 偶发失效时的同款兜底）
  const r = await js(String.raw`(() => {
    const bs = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === '发布文章' && b.offsetParent !== null && !b.closest('.modal__inner-2'));
    const b = bs.find(x => x.classList.contains('btn-publish')) || bs[0];
    if (!b) return 'not-found'; b.click(); return 'clicked';
  })()`);
  if (r !== 'clicked') fail('找不到编辑器页「发布文章」按钮（button.btn-publish），抽屉打不开（未登录或改版）');
  // skill 实测发现第 7 条：抽屉可能在点击后才完成渲染，wait 后再查 DOM
  for (let i = 0; i < 3; i++) {
    await wait(1.5);
    const ok = await js(String.raw`!!document.querySelector('.modal__inner-2')`);
    if (ok) { step('drawer', 'open'); return; }
    await wait(1);
  }
  fail('未登录或改版：点了「发布文章」但抽屉容器 .modal__inner-2 没出现');
}
const readTagChips = () => js(String.raw`[...document.querySelectorAll('.el-tag.el-tag--light.mark_selection_box_el_tag')].map(e => e.innerText.trim()).filter(Boolean)`);
async function setTagsViaComponent() {
  // skill 第 5 步方案 B（唯一可靠路径）：ElInput→ElAutocomplete→mark-selection，selected.splice + saveTagToStore()
  return await js(sub(String.raw`(() => {
    const target = JSON.parse(${DECODE('__TJ__')});
    const i = document.querySelector('.modal__inner-2 input[placeholder*="标签"]') || document.querySelector('input[placeholder*="标签"]');
    if (!i) return 'no-input';
    let e = i, c = null;
    while (e) { if (e.__vue__) { c = e.__vue__; break; } e = e.parentElement; }
    if (!c) return 'no-vue';
    let m = null, n = c;
    for (let d = 0; n && d < 8; d++) { if (typeof n.tagOnLine === 'function') { m = n; break; } n = n.$parent; }
    if (!m) return 'no-component';
    m.selected.splice(0, m.selected.length, ...target);   // splice 保证 Vue 响应式即时渲染
    m.tagInputValue = '';
    if (typeof m.saveTagToStore !== 'function') return 'no-saveTagToStore';
    m.saveTagToStore();   // 关键：不调它保存草稿后标签必然丢失
    return JSON.stringify({ selected: m.selected, saveCalled: true });
  })()`, '__TJ__', b64(JSON.stringify(tagList))));
}
async function tryHotChips() {
  // skill 方案 A：热词 chip 点击即真实入账且持久化；但词表每会话不同（第 13 条），只做精确命中。
  // 注意排除已选标签：.el-tag--light 同时匹配热词与已选（第 70 行）
  let hits = 0;
  for (const t of tagList) {
    const res = await js(sub(String.raw`(() => {
      const chips = [...document.querySelectorAll('.modal__inner-2 .el-tag.el-tag--light')]
        .filter(e => e.offsetParent !== null && !e.classList.contains('mark_selection_box_el_tag'));
      const c = chips.find(e => e.innerText.trim() === "__T__");
      if (!c) return 'miss'; c.click(); return 'clicked';
    })()`, '__T__', t));
    if (res === 'clicked') hits++;
    step('hot chip ' + t, res);
    await wait(0.8);
  }
  return hits;
}
async function addTags() {
  if (!tagList.length) return await readTagChips();
  // skill 第 11 条：入口是 button（按叶子文案找会找不到）
  const opened = await js(String.raw`(() => {
    const b = document.querySelector('.modal__inner-2 button.tag__btn-tag');
    if (!b) return 'not-found'; b.click(); return 'clicked';
  })()`);
  if (opened !== 'clicked') { step('warn', '找不到「添加文章标签」入口（.modal__inner-2 button.tag__btn-tag），跳过标签'); return await readTagChips(); }
  await wait(2);   // 等标签面板渲染出 input.el-input__inner[placeholder*="标签"]
  const compRes = await setTagsViaComponent();
  step('tags via component', compRes);
  if (['no-input', 'no-vue', 'no-component', 'no-saveTagToStore'].includes(compRes)) {
    const hits = await tryHotChips();
    if (!hits) step('warn', '方案 B 失败（' + compRes + '）且热词也没命中，标签可能缺失——别信任何 added 假象（skill 第 4 条）');
  }
  await wait(1);
  const chips = await readTagChips();
  step('tags ok', chips);
  return chips;
}
async function handleColumn() {
  // skill 第 8/9/60 条：input.tag__option-chk 是「分类专栏」，绝不是文章标签，勿用来加标签；
  // 账号无专栏时它们全部隐藏（offsetWidth/Height 均为 0），此时什么都不点、留空发布。
  // 专栏最多选 1 个；误勾必须逐个 click 取消。
  // TODO 待实测：有专栏时条目的确切点击目标（label 还是 input），skill 只给了复选框本身。
  const probeRaw = await js(String.raw`(() => {
    const all = [...document.querySelectorAll('input.tag__option-chk')];
    const vis = all.filter(i => i.offsetWidth !== 0 || i.offsetHeight !== 0);
    const labels = vis.map(i => { const p = i.closest('label') || i.parentElement; return p ? p.innerText.trim() : ''; }).filter(Boolean);
    return JSON.stringify({ total: all.length, visible: vis.length, labels: labels.slice(0, 30), checked: document.querySelectorAll('input.tag__option-chk:checked').length });
  })()`);
  const probe = JSON.parse(probeRaw);
  step('column probe', probe);
  let picked = false;
  if (!probe.visible) { step('column', 'keep-empty（账号无已有专栏，复选框全隐藏，按 skill 留空）'); }
  else if (category) {
    const idx = probe.labels.indexOf(category);
    if (idx === -1) { step('warn', `分类专栏里没有名为「${category}」的已有专栏，按 skill 保持未选择（不新建凑数）`); }
    else {
      const pick = await js(String.raw`(() => {
        const vis = [...document.querySelectorAll('input.tag__option-chk')].filter(i => i.offsetWidth !== 0 || i.offsetHeight !== 0);
        const el = vis[__IDX__]; if (!el) return 'not-found';
        const p = el.closest('label'); if (p) { p.click(); return 'label-clicked'; }
        el.click(); return 'input-clicked';
      })()`.split('__IDX__').join(String(idx)));
      await wait(1);
      const chk = await js(String.raw`document.querySelectorAll('input.tag__option-chk:checked').length`);
      step('column pick', { want: category, res: pick, checked: chk });
      if (Number(chk) === 1) picked = true;
      else {
        await js(String.raw`(() => { [...document.querySelectorAll('input.tag__option-chk:checked')].forEach(i => i.click()); return 'unchecked'; })()`);
        step('warn', '专栏勾选复核不为 1，已全部取消、留空发布（skill 纪律：只允许 0 或 1 个）');
      }
    }
  } else {
    step('column', '未指定专栏，不点选');
  }
  // 安全阀：除非刚刚成功主动选中了唯一一个专栏，否则任何残留勾选（改版默认勾上等）逐个 click 取消（skill 第 8/227 行）
  if (!picked) {
    const stray = await js(String.raw`(() => {
      const cs = [...document.querySelectorAll('input.tag__option-chk:checked')];
      if (!cs.length) return 'none-checked';
      cs.forEach(i => i.click());
      return 'unchecked:' + cs.length;
    })()`);
    if (String(stray).startsWith('unchecked')) step('warn', '检测到误勾的分类专栏复选框并已取消: ' + stray);
  }
}
async function handleSummary() {
  if (!summary) return;
  // TODO 待实测：skill 第 242 行明确「摘要缺省自动截取，一般不动」，未给摘要字段选择器。
  // 这里只做 .modal__inner-2 textarea 的泛化探测，探不到就跳过，不硬闯。
  const r = await js(sub(String.raw`(() => {
    const ta = document.querySelector('.modal__inner-2 textarea');
    if (!ta) return 'no-field';
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, ${DECODE('__SUM__')});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`, '__SUM__', b64(summary)));
  step('summary', r);
  if (r === 'no-field') step('warn', '摘要字段没探到（TODO 待实测），跳过；CSDN 会自动截取正文做摘要');
}
async function handleCover() {
  // a) 本地封面文件：skill 是 bb-browser 写的（无 uploadFile），也没给封面上传 input 的选择器。
  // TODO 待实测：.modal__inner-2 内「从本地上传」对应的 input[type=file] 是否存在、能否直接被 uploadFile 喂。
  if (cover && existsSync(cover)) {
    const found = await js(String.raw`!!document.querySelector('.modal__inner-2 input[type=file]')`);
    if (found) {
      try {
        await uploadFile('.modal__inner-2 input[type=file]', cover);
        await wait(6);
        step('cover file', 'uploaded');
      } catch (e) { step('warn', '本地封面上传失败: ' + e.message) }
    } else step('warn', '未探到封面上传 input[type=file]（TODO 待实测），跳过本地封面');
  }
  // b) 正文图候选当封面（skill 实测发现第 5 条，两步都点才算生效）
  const cand = await js(String.raw`(() => {
    const list = document.querySelector('.modal__inner-2 .img-selection-list');
    if (!list) return 'no-list';
    const items = list.querySelectorAll('.img-selection-item');
    if (!items.length) return 'no-items';
    items[0].click(); return 'clicked-first';
  })()`);
  if (cand === 'clicked-first') {
    await wait(2);   // 进入裁剪态（封面项变「图片编辑/封面图预览/确认上传」）
    // 「确认上传」是 .vicp-operate-btn 里的叶子节点，closest('button') 取不到，必须按类名点
    const confirm = await js(String.raw`(() => { const b = [...document.querySelectorAll('.vicp-operate-btn')][0]; if (!b) return 'no-confirm-btn'; b.click(); return 'confirmed'; })()`);
    await wait(3);
    // 判定以 img[src*="/direct/"] 存在为准，别看「添加封面」字样（易误判成已清除）
    const ok = await js(String.raw`!!document.querySelector('img[src*="/direct/"]')`);
    step('cover from body img', { cand, confirm, ok });
    if (!ok) step('warn', '未见 img[src*="/direct/"]，封面可能没生效（skill：必须点确认上传）');
  } else {
    step('cover', cand);
    step('note', '封面候选未出现（正文可能没有可用图）；封面非必填，可直接发布（skill 第 5 条）');
  }
}
async function draftUrl() {
  // skill 实测发现第 7 条：当前版本抽屉保留 URL 里的 articleId 草稿地址；刷新时优先回原草稿
  const u = (await pageInfo()).url;
  return /articleId/i.test(u) ? u : EDITOR;
}

/* ---------- 4. 主流程 ---------- */
await fillTitle();
await injectBody();
await verifyBody(true);
// skill 第 55 行：转存校验——注入后 csdnimg.cn 出现次数应等于成功转存的图片数
if (extImgs.length) {
  const csdnCount = await js(String.raw`((document.querySelector('.editor__inner')?.textContent || '').match(/csdnimg\.cn/g) || []).length`);
  step('img check', { extImgs: extImgs.length, csdnimgInBody: csdnCount });
  if (csdnCount === 0) step('warn', '正文里一个 csdnimg.cn 都没有，外链图可能全部转存失败');
}

await openDrawer();
await handleColumn();     // 专栏先处理（危险坑：它是复选框，和标签完全两个区域）
await guardBody('抽屉打开后');
const chips1 = await addTags();
await guardBody('标签操作后');
await handleSummary();
await handleCover();
if (tagList.length && !chips1.length) {
  if (ARGS.mode === 'publish') { await shot(); fail('标签一个都没入账（面板不可用或被改版），直发已停止'); }
  step('warn', '标签为空，草稿模式继续（请人工在抽屉里补标签）');
}

step('ready', await js(String.raw`(() => {
  const e = document.querySelector('.editor__inner');
  return JSON.stringify({
    title: document.querySelector('input.article-bar__title--input')?.value || '',
    bodyLen: e ? e.textContent.length : -1,
    tags: [...document.querySelectorAll('.el-tag.mark_selection_box_el_tag')].map(x => x.innerText.trim()).filter(Boolean),
    columnChecked: document.querySelectorAll('input.tag__option-chk:checked').length,
    coverDirect: !!document.querySelector('img[src*="/direct/"]')
  });
})()`));

/* ---------- 5. 草稿 / 直发 ---------- */
// 两种模式都先「保存为草稿」：skill 第 5 步把「存草稿→刷新→重开抽屉→查 mark_selection_box_el_tag」
// 定为标签持久化的唯一可靠验证（tagOnLine/Enter/'added' 返回值全是假象，第 4 条）。
const draftSaveRes = await (async () => {
  const r = await js(String.raw`(() => {
    const b = [...document.querySelectorAll('.modal__inner-2 button')].find(x => x.innerText.trim().includes('保存为草稿') && x.offsetParent !== null);
    if (!b) return 'not-found'; b.click(); return 'clicked';
  })()`);
  if (r !== 'clicked') step('warn', '抽屉里没找到「保存为草稿」按钮（skill 第 11 条定位法）');
  await wait(3);
  return r;
})();
step('draft save', { res: draftSaveRes, url: await draftUrl() });

// 刷新回草稿 → 重开抽屉 → 校验标签持久化
const backUrl = await draftUrl();
try {
  await openOrReuseTab(backUrl, { wait: true, timeout: 35 });
} catch (e) { fail('草稿刷新回跳超时: ' + e.message) }
await wait(3);
const reload = JSON.parse(await js(String.raw`(() => JSON.stringify({
  hasTitle: !!document.querySelector('input.article-bar__title--input'),
  title: document.querySelector('input.article-bar__title--input')?.value || '',
  hasBody: !!document.querySelector('.editor__inner'),
  bodyLen: (document.querySelector('.editor__inner')?.textContent || '').length
}))()`));
step('reload', { url: (await pageInfo()).url, reload });
if (!reload.hasTitle || !reload.hasBody) fail(`未登录或改版：刷新后编辑器没回到草稿态（当前 ${(await pageInfo()).url}）`);

let needRedo = null;
if (reload.title !== title) needRedo = '标题刷新后丢失/不一致: ' + JSON.stringify(reload.title);
else if (norm(await readBodyText()) !== norm(finalBody)) needRedo = '正文刷新后与本地不一致（页面 ' + reload.bodyLen + ' / 本地 ' + finalBody.length + '）';
if (needRedo) {
  // 直发模式绝不允许带着坏内容点发布；草稿模式也重做一遍，让人工核对到完整内容
  step('warn', needRedo + ' → 重新注入并重走标签/封面流程');
  await fillTitle();
  await injectBody();
  await verifyBody(true);
  await openDrawer();
  await handleColumn();
  await addTags();
  await guardBody('重做标签后');
  await handleCover();
  const r2 = await js(String.raw`(() => {
    const b = [...document.querySelectorAll('.modal__inner-2 button')].find(x => x.innerText.trim().includes('保存为草稿') && x.offsetParent !== null);
    if (!b) return 'not-found'; b.click(); return 'clicked';
  })()`);
  step('draft save redo', r2);
  await wait(3);
  await openDrawer();   // 重开抽屉准备下一步校验/发布
  await wait(1);
} else {
  await openDrawer();
  await wait(1);
  const persist = await readTagChips();
  step('tags persisted', { want: tagList, got: persist });
  if (tagList.length && !persist.length) {
    // 持久化没过分两种可能：漏调 saveTagToStore（已被我们排除）或抽屉未回显。重做一次方案 B 再存草稿。
    step('warn', '刷新后标签 chips 没回来，重走 selected+saveTagToStore 再存一次草稿（skill 第 5 步持久化验证）');
    await addTags();
    const r2 = await js(String.raw`(() => {
      const b = [...document.querySelectorAll('.modal__inner-2 button')].find(x => x.innerText.trim().includes('保存为草稿') && x.offsetParent !== null);
      if (!b) return 'not-found'; b.click(); return 'clicked';
    })()`);
    step('draft save retry', r2);
    await wait(3);
    const after = await readTagChips();
    step('tags persisted retry', after);
    if (tagList.length && !after.length && ARGS.mode === 'publish') { await shot(); fail('标签持久化两次验证都失败，直发已停止（草稿已保存，可人工核对）'); }
  }
}

await guardBody('发布前');

if (ARGS.mode !== 'publish') {
  // 草稿模式：到此为止，绝不点最终「发布文章」
  step('draft url', (await pageInfo()).url);
  step('result', 'DRAFT_OK');
  await completeTaskSpace(SPACE_USED, { keep: true }).catch(() => {});   // 留标签页给人核对
} else {
  // skill 第 6 步：最终发布按钮在 .modal__inner-2 内、文案恰为「发布文章」、class btn-b-red
  const pub = await js(String.raw`(() => {
    const bs = [...document.querySelectorAll('.modal__inner-2 button')].filter(b => b.innerText.trim() === '发布文章' && b.offsetParent !== null);
    const b = bs.find(x => /btn-b-red/.test(x.className)) || bs[0];
    if (!b) return 'not-found'; b.click(); return 'clicked';
  })()`);
  step('publish', pub);
  if (pub !== 'clicked') { await shot(); fail('抽屉里找不到最终「发布文章」按钮（.modal__inner-2, btn-b-red）'); }
  await wait(5);
  const after = await pageInfo();
  // skill 第 8 步成功判定：URL 变 mp.csdn.net/mp_blog/creation/success/<id>，或含「发布成功」，或跳 blog.csdn.net/.../details/<id>
  const link = await js(String.raw`(() => {
    const m = location.href.match(/https:\/\/mp\.csdn\.net\/mp_blog\/creation\/success\/\d+/);
    if (m) return m[0];
    if (/发布成功/.test(document.title) || /发布成功/.test(document.body.innerText.slice(0, 2000))) return location.href;
    const a = [...document.querySelectorAll('a')].find(x => /blog\.csdn\.net\/[^/]+\/article\/details\/\d+/.test(x.href));
    return a ? a.href : '';
  })()`);
  if (link) {
    step('result', 'PUBLISH_OK');
    step('link', link);
    step('note', 'CSDN 发布后需审核，审核通过才公开展示（skill 输出格式备注）');
    await completeTaskSpace(SPACE_USED, { keep: false }).catch(() => {});
  } else if (/creation\/success/.test(after.url)) {
    step('result', 'PUBLISH_OK');
    step('link', after.url);
    await completeTaskSpace(SPACE_USED, { keep: false }).catch(() => {});
  } else {
    await shot();
    fail('提交后既没拿到 success/details 链接也没见「发布成功」，当前 ' + after.url);
  }
}
step('done', 'ok');
