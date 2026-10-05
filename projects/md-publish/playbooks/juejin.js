/* 掘金发文 playbook —— 由 juejin-publish skill 的实测选择器逐条移植，纯确定性执行，无 LLM 参与。
   bridge 会注入 ARGS：{ file, mode:'draft'|'publish', title?, tags?:[], category?, summary?, cover? } */
/*ARGS_TOKEN__*/
const { readFileSync, existsSync } = await import('node:fs');

const PLATFORM = 'juejin';
const SPACE = 'mdps juejin';
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

const EDITOR = 'https://juejin.cn/editor/drafts/new?v=2';
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
const title = (ARGS.title || fm.title || (body.match(/^\s*#\s+(.+)$/m) || [])[1]
  || ARGS.file.split('/').pop().replace(/\.(md|markdown|txt)$/i, '')).trim();

const CATS = {
  '后端': ['java', 'spring', 'go ', 'python', '微服务', '网关', 'mysql', 'redis', 'kafka', '分布式', '数据库', 'jvm', '高并发', '后端', 'rpc', 'dubbo'],
  '前端': ['vue', 'react', 'javascript', 'typescript', 'css', 'webpack', '前端', 'node.js', '浏览器', 'html'],
  'Android': ['android', 'kotlin', 'jetpack', 'gradle', 'apk'],
  'iOS': ['ios', 'swift', 'objective-c', 'xcode', 'swiftui'],
  '人工智能': ['llm', '大模型', '机器学习', '深度学习', '神经网络', 'gpt', 'transformer', ' ai', 'rag', 'langchain', '训练', '推理', 'agent', '智能体'],
  '开发工具': ['git', 'docker', 'kubernetes', 'vscode', 'idea', 'ci/cd', 'vim', 'shell', '效率工具'],
  '代码人生': ['面试', '职场', '感悟', '成长', '跳槽', '复盘', '副业'],
  '阅读': ['读书', '书评', '读后感'],
};
const lower = body.toLowerCase();
let category = ARGS.category || fm.category || '';
if (!CATS[category]) {
  let best = '后端', score = 0;
  for (const [c, kws] of Object.entries(CATS)) {
    let s = 0; for (const k of kws) s += lower.split(k).length - 1;
    if (s > score) { score = s; best = c }
  }
  category = best;
}
const rawTags = (ARGS.tags && ARGS.tags.length ? ARGS.tags
  : (fm.tags || '').replace(/[\[\]]/g, '').split(/[,，]/).map(x => x.trim()).filter(Boolean)).slice(0, 3);
const tagList = rawTags.length ? rawTags : [category];
const summary = ARGS.summary || fm.summary || '';
const cover = ARGS.cover || fm.cover || '';
const localImgs = (body.match(/!\[[^\]]*\]\((?!https?:)[^)]+\)/g) || []).length;
step('meta', { title, category, tags: tagList, mode: ARGS.mode, chars: body.replace(/\s+/g, '').length, localImgs });
if (localImgs) step('note', `正文含 ${localImgs} 张本地图片，平台拉不到，发布后需手动补图`);

/* ---------- 2. 打开编辑器 + 登录检测 ---------- */
const task = await openSpace();
try {
  await openOrReuseTab(EDITOR, { wait: true, timeout: 35 });
} catch (e) { fail('打开编辑器超时: ' + e.message) }
await wait(3);
const info = await pageInfo();
if (!/juejin\.cn/.test(info.url)) fail('未停在掘金编辑器: ' + info.url);
const ready = await js(String.raw`!!document.querySelector('input.title-input')`);
if (!ready) fail('未登录或已改版：找不到 input.title-input（当前 ' + info.url + '）');
step('editor', info.url);

/* ---------- 3. 填标题 ---------- */
await fillInput('input.title-input', title);
await wait(1);
const gotTitle = await js(String.raw`document.querySelector('input.title-input')?.value || ''`);
if (gotTitle !== title) fail('标题写入不一致: ' + JSON.stringify(gotTitle));
step('title ok', gotTitle);

/* ---------- 4. 写正文（base64 注入 CodeMirror，失败退 bytemd textarea） ---------- */
const b64 = Buffer.from(body, 'utf8').toString('base64');
const wrote = await js(sub(String.raw`(() => {
  const md = new TextDecoder().decode(Uint8Array.from(atob("__B64__"), c => c.charCodeAt(0)));
  const cm = document.querySelector('.CodeMirror');
  if (cm && cm.CodeMirror) { cm.CodeMirror.setValue(md); return 'cm'; }
  const ta = document.querySelector('.bytemd-editor textarea') || document.querySelector('textarea.inputarea');
  if (ta) {
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, md); ta.dispatchEvent(new Event('input', { bubbles: true })); return 'textarea';
  }
  return 'none';
})()`, '__B64__', b64));
if (wrote === 'none') fail('找不到正文编辑器（.CodeMirror / bytemd textarea 都没有）');
await wait(2.5);
const verify = await js(String.raw`(() => {
  const cm = document.querySelector('.CodeMirror')?.CodeMirror;
  const v = cm ? cm.getValue() : (document.querySelector('.bytemd-editor textarea')?.value || '');
  return { len: v.length, head: v.slice(0, 24), tail: v.slice(-24), count: (document.body.innerText.match(/正文字数:\s*(\d+)/) || [])[1] || 'n/a' };
})()`);
if (verify.len < body.length * 0.9) fail(`正文疑似被截断（页面 ${verify.len} / 本地 ${body.length}）`);
step('body ok', Object.assign({ via: wrote }, verify));

/* ---------- 5. 打开发布抽屉 ---------- */
const opened = await js(String.raw`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '发布' && x.offsetParent !== null);
  if (!b) return 'no-btn'; b.click(); return 'clicked';
})()`);
if (opened !== 'clicked') fail('找不到「发布」按钮，抽屉没打开');
await wait(2.5);

/* ---------- 6. 分类 ---------- */
const catRes = await js(sub(String.raw`(() => {
  const t = [...document.querySelectorAll('div.item')].find(e => e.innerText.trim() === "__CAT__" && e.offsetParent !== null);
  if (!t) return 'not-found'; t.click(); return 'clicked';
})()`, '__CAT__', category));
await wait(1);
const active = await js(String.raw`[...document.querySelectorAll('div.item.active')].map(e => e.innerText.trim())`);
step('category', { want: category, res: catRes, active });
if (catRes !== 'clicked') step('warn', '分类项没命中，掘金会用默认分类');

/* ---------- 7. 标签（词表受控，命中才加，上限 3） ---------- */
async function clearTagInput() {
  await js(String.raw`(() => {
    const i = document.querySelectorAll('input.byte-select__input')[0]; if (!i) return;
    i.focus();
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(0.4);
}
let added = 0;
for (const t of tagList) {
  if (added >= 3) break;
  let res = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    await clearTagInput();
    await typeText(t);
    await wait(3);   // 候选下拉实测 2.2s 偶发不够，取 3s
    const pageJs = sub(sub(String.raw`(() => {
      const opts = [...document.querySelectorAll('.byte-select-option')].filter(e => e.offsetParent !== null);
      const el = opts.find(e => e.innerText.trim() === "__T__") || opts.find(e => e.innerText.trim().toLowerCase() === "__TL__");
      if (el) { el.click(); return 'picked'; }
      return 'miss:' + opts.slice(0, 6).map(e => e.innerText.trim()).join('|');
    })()`, '__TL__', t.toLowerCase()), '__T__', t);
    res = await js(pageJs);   // 只执行一次：再执行会把刚选中的标签点掉
    // 一个候选都没列出＝下拉没展开（方法问题），重试一次；有候选但没精确命中＝词表没这个词，不重试
    if (res !== 'miss:') break;
    if (attempt === 1) { step('tag ' + t + ' retry', 'empty dropdown'); await wait(1.5) }
  }
  step('tag ' + t, res);
  if (res === 'picked') added++;
  await wait(1);
}
const chips = await js(String.raw`(() => {
  const cw = document.querySelectorAll('.tag-input.select .byte-select__content-wrap')[0];
  return cw ? [...cw.children].map(e => e.innerText.trim()).filter(Boolean) : [];
})()`);
step('tags ok', chips);
if (!chips.length) fail('掘金标签必填，但一个都没加进去（词表未命中）');

/* ---------- 8. 摘要 / 封面（可选） ---------- */
if (summary) {
  step('summary', await js(sub(String.raw`(() => {
    const ta = [...document.querySelectorAll('textarea')].find(t => (t.closest('div')?.parentElement?.innerText || '').includes('摘要'));
    if (!ta) return 'no-field';
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, "__SUM__"); ta.dispatchEvent(new Event('input', { bubbles: true })); return 'ok';
  })()`, '__SUM__', summary)));
}
if (cover && existsSync(cover)) {
  const before = await js(String.raw`document.querySelector('.CodeMirror')?.CodeMirror?.getValue().length || 0`);
  try {
    await uploadFile('input[type=file]', cover);   // 第一个 input[type=file] 才是封面；input.file-input 是正文插图
    await wait(6);
    const after = await js(String.raw`document.querySelector('.CodeMirror')?.CodeMirror?.getValue().length || 0`);
    const preview = await js(String.raw`!!document.querySelector('.form-item img[src^="http"]')`);
    step('cover', { bodyLenDelta: after - before, preview });
    if (after !== before) step('warn', '封面上传后正文长度变了，请人工核对');
  } catch (e) { step('warn', '封面上传失败: ' + e.message) }
}

/* ---------- 9. 草稿 / 直发 ---------- */
step('ready', await js(String.raw`(() => ({
  title: document.querySelector('input.title-input')?.value,
  cat: [...document.querySelectorAll('div.item.active')].map(e => e.innerText.trim()),
  tags: (() => { const cw = document.querySelectorAll('.tag-input.select .byte-select__content-wrap')[0]; return cw ? [...cw.children].map(e => e.innerText.trim()).filter(Boolean) : [] })(),
  chars: (document.body.innerText.match(/正文字数:\s*(\d+)/) || [])[1] || '0'
}))()`));

if (ARGS.mode !== 'publish') {
  const saved = await js(String.raw`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /保存草稿/.test(x.innerText.trim()) && x.offsetParent !== null);
    if (b) { b.click(); return 'save-clicked' }
    const c = [...document.querySelectorAll('button')].find(x => /^(取消|关闭)/.test(x.innerText.trim()) && x.offsetParent !== null);
    if (c) { c.click(); return 'cancel-clicked' }
    return 'no-button';
  })()`);
  await wait(2.5);
  step('draft', saved + '（编辑器内容掘金会自动留在草稿箱）');
  step('draft url', (await pageInfo()).url);
  step('result', 'DRAFT_OK');
  await completeTaskSpace(SPACE_USED, { keep: true }).catch(() => {});   // 留标签页给人核对
} else {
  step('publish', await js(String.raw`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '确定并发布' && x.offsetParent !== null);
    if (!b) return 'not-found'; b.click(); return 'clicked';
  })()`));
  await wait(5);
  const after = await pageInfo();
  const link = await js(String.raw`(() => {
    if (/\/(post|spost)\//.test(location.href)) return location.href;
    const a = [...document.querySelectorAll('a')].find(x => /\/(post|spost)\//.test(x.href));
    return a ? a.href : '';
  })()`);
  if (link || /发布成功/.test(after.title)) {
    step('result', 'PUBLISH_OK');
    step('link', link || after.title);
    await completeTaskSpace(SPACE_USED, { keep: false }).catch(() => {});
  } else {
    await shot();
    fail('提交后既没拿到链接也没见「发布成功」，当前 ' + after.url);
  }
}
step('done', 'ok');
