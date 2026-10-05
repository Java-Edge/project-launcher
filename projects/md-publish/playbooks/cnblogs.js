/* 博客园发文 playbook —— 由 cnblogs-publish skill 的实测选择器逐条移植（SKILL.md 选择器实测于 2026-09），
   纯确定性执行，运行期零 LLM。选择器全部出自 SKILL.md 的「⚠️ 实测关键发现」（19-29 行）+「页面元素速查」（227-242 行）；
   skill 没写明的地方一律不猜：标 `// TODO 待实测：` 并把该步骤降级为「探测不到就 step('warn') 跳过」。
   博客园专有差异（掘金的 8 分类关键词表在此不适用，别照抄）：
     - 正文是原生 textarea #md-editor（不是 CodeMirror），native setter + input 事件（SKILL.md:21/232）
     - 「个人分类」是账号自定义的数字 id checkbox，只能从页面实测列表里选，匹配不到就留空（SKILL.md:24/69/190）
     - 有真草稿态：button「存为草稿」入草稿箱（SKILL.md:26/240）
     - 元素速查里没有封面字段 → ARGS.cover 忽略并提示，不猜选择器
   bridge 会注入 ARGS：{ file, mode:'draft'|'publish', title?, tags?:[], category?, summary?, cover? } */
/*ARGS_TOKEN__*/
const { readFileSync, existsSync } = await import('node:fs');

const PLATFORM = 'cnblogs';
const SPACE = 'mdps cnblogs';
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

const EDITOR = 'https://i.cnblogs.com/articles/edit';   // SKILL.md:10 新建文章编辑器
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
const b64of = (s) => Buffer.from(String(s), 'utf8').toString('base64');

// native setter + dispatch input（SKILL.md:21/22/110-114 实测：Angular 会转 ng-dirty 且值保留）
// 值走 base64 传入，绝不拼进页面脚本的字符串字面量（标题/分类/标签里带引号就会把注入代码写坏）
async function setNative(sel, text) {
  return await js(sub(sub(String.raw`(() => {
    const el = document.querySelector("__SEL__");
    if (!el) return 'no-el';
    const v = new TextDecoder().decode(Uint8Array.from(atob("__B64__"), c => c.charCodeAt(0)));
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { wrote: el.value.length, dirty: el.className.includes('ng-dirty') };
})()`, '__SEL__', sel), '__B64__', b64of(text)));
}

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
// 标题：frontmatter.title → 正文首个 # 一级标题 → 文件名清洗（SKILL.md:67）
const title = (ARGS.title || fm.title || (body.match(/^\s*#\s+(.+)$/m) || [])[1]
  || ARGS.file.split('/').pop().replace(/\.(md|markdown|txt)$/i, '')).trim();

// 标签：ARGS ∪ frontmatter，去重取前 5（SKILL.md:58/67「1~5 个」，允许新建标签）
const seenTag = new Set();
const tagList = (ARGS.tags || []).concat((fm.tags || '').replace(/[\[\]]/g, '').split(/[,，]/).map(x => x.trim()))
  .filter(t => t && !seenTag.has(t.toLowerCase()) && seenTag.add(t.toLowerCase())).slice(0, 5);

// 分类：必须从页面实测出来的 checkbox 文案里选，匹配不到就留空（SKILL.md:69/190）——这里只记下想要值
const wantCategory = (ARGS.category || fm.category || '').trim();
// 摘要可选，缺省由平台截取（SKILL.md:25）
const summary = ARGS.summary || fm.summary || '';
// frontmatter 的 aigc: true → 勾选 #post-is-aigc（SKILL.md:63/236）
const aigc = /^(true|1|yes)$/i.test(fm.aigc || '');
// 封面：SKILL.md 元素速查（229-242 行）没有封面字段 → 不猜选择器
const cover = ARGS.cover || fm.cover || '';

// 正文保留文首 # 标题（SKILL.md:70 博客园不自动加 H1），不额外删改
const localImgs = (body.match(/!\[[^\]]*\]\((?!https?:)[^)]+\)/g) || []).length;
const extImgs = (body.match(/!\[[^\]]*\]\((https?:[^)]+)\)/g) || []);
const hotlinkImgs = extImgs.filter(x => /twimg\.com|twitter\.com|x\.com/i.test(x)).length;

step('meta', { title, tags: tagList, wantCategory, summary: !!summary, aigc, mode: ARGS.mode, chars: body.replace(/\s+/g, '').length, localImgs, extImgs: extImgs.length, hotlinkImgs });
if (localImgs) step('note', `正文含 ${localImgs} 张本地图片，博客园拉不到，发布后需手动补图`);
if (hotlinkImgs) step('note', `正文含 ${hotlinkImgs} 张 Twitter/X 域外链图，读者端可能裂图（SKILL.md:27）`);
if (cover) step('note', 'ARGS.cover 已忽略：SKILL.md 页面元素速查无封面字段，未实测不猜选择器');

/* ---------- 2. 打开编辑器 + 登录检测 ---------- */
const task = await openSpace();
try {
  await openOrReuseTab(EDITOR, { wait: true, timeout: 35 });
} catch (e) { fail('打开编辑器超时: ' + e.message) }
await wait(3);
const info = await pageInfo();
if (/account\.cnblogs\.com\/signin|\/signin|\/login/i.test(info.url)) fail('未登录或改版：编辑页跳到了登录页 ' + info.url);   // SKILL.md:92（不调 handOff，桥任务没有人在循环里）
if (!/cnblogs\.com/i.test(info.url)) fail('未停在博客园编辑页: ' + info.url);
// openOrReuseTab 可能复用到「编辑已有文章」的标签页：?postId= 页填下去会覆盖旧文章（SKILL.md:257 明确警告）
if (/[?&]postId=/i.test(info.url)) fail('复用到了已有文章的编辑页（URL 带 postId），为避免覆盖旧文章已中止，请关掉那个标签页再试');
const has = await js(String.raw`(() => ({
  title: !!document.querySelector('input#post-title'),
  md: !!document.querySelector('textarea#md-editor'),
  pub: [...document.querySelectorAll('button')].some(x => x.innerText.trim() === '发布' && x.offsetParent !== null)
}))()`);
step('editor', Object.assign({ url: info.url }, has));
if (!has.title) fail('未登录或改版：找不到 input#post-title（当前 ' + info.url + '）');
// SKILL.md:29/251：#md-editor 不存在 = 账号编辑器设置不是 Markdown
if (!has.md) fail('未登录或改版：找不到 textarea#md-editor（账号编辑器可能不是 Markdown 模式，需到「设置编辑器」切回）');
if (!has.pub) step('warn', '页面当前没有可见的「发布」按钮（可能表单还没渲染完）');

/* ---------- 3. 填标题（native setter，SKILL.md:22/231 实测 Angular 绑定生效） ---------- */
const tSet = await setNative('input#post-title', title);
if (tSet === 'no-el') fail('未登录或改版：找不到 input#post-title');
await wait(1);
const gotTitle = await js(String.raw`document.querySelector('input#post-title')?.value || ''`);
if (gotTitle !== title) fail('标题写入不一致: ' + JSON.stringify(gotTitle));
step('title ok', { val: gotTitle, dirty: tSet.dirty });

/* ---------- 4. 写正文（base64 注入原生 textarea，非 CodeMirror） ---------- */
const bSet = await setNative('textarea#md-editor', body);
if (bSet === 'no-el') fail('未登录或改版：找不到 textarea#md-editor');
await wait(2.5);
const verify = await js(String.raw`(() => {
  const el = document.querySelector('textarea#md-editor');
  const v = el ? el.value : '';
  return { len: v.length, head: v.slice(0, 24), tail: v.slice(-24), dirty: !!el && el.className.includes('ng-dirty') };
})()`);
if (verify.len < body.length * 0.9) fail(`正文疑似被截断（页面 ${verify.len} / 本地 ${body.length}）`);
if (verify.head !== body.slice(0, 24) || verify.tail !== body.slice(-24)) fail('正文首尾与本地不一致，可能被杂散文本污染');
if (!verify.dirty) step('warn', '注入后 #md-editor 没出现 ng-dirty，Angular 可能没接到值（SKILL.md:127 建议重注入一次）');
step('body ok', Object.assign({ via: 'native-textarea' }, verify));
const bodyLenBaseline = verify.len;   // 之后每次键入/点击都拿它复核正文没被写坏

/* ---------- 5. 标签：第 2 个 .ant-select（Tag 标签）+ 真实键盘键入（SKILL.md:23/129-166/234） ---------- */
// 合成事件写搜索词不触发远程搜索，必须 focus+click 后 typeText；所以「焦点确实落在标签 input 上」是硬前置：
// 焦点落错就会把词打进正文或别的 input，既写坏文章内容，也会用「新建标签」建出脏标签（SKILL.md:166「不要把标签写进别的输入框」）。
const selProbe = await js(String.raw`(() => {
  const sels = [...document.querySelectorAll('.ant-select')];
  const s = sels[1];
  return {
    count: sels.length,
    hasInput: !!(s && s.querySelector('input')),
    placeholder: s ? (s.querySelector('.ant-select-selection-placeholder')?.innerText || '').trim() : '',
    chips: s ? [...s.querySelectorAll('.ant-select-selection-item')].map(x => x.title || x.innerText.trim()) : []
  };
})()`);
async function readTagChips() {
  return await js(String.raw`(() => {
    const s = document.querySelectorAll('.ant-select')[1];
    return s ? [...s.querySelectorAll('.ant-select-selection-item')].map(x => x.title || x.innerText.trim()) : [];
  })()`);
}
step('tag select', selProbe);
let tagDone = 0, tagSkipped = '';
if (selProbe.count < 2 || !selProbe.hasInput) {
  // 拿不到「第二个 .ant-select」就无法确定标签控件在哪，绝不能往 select[0] 里打字
  tagSkipped = 'no-tag-select';
  step('warn', `标签全部跳过：第 2 个 .ant-select 不存在（实测 count=${selProbe.count}），可能改版，不猜选择器`);
} else {
  for (const t of tagList) {
    if ((await readTagChips()).some(x => x.toLowerCase() === t.toLowerCase())) { step('tag ' + t, 'already-present'); tagDone++; continue; }

    // 每轮先确认搜索框是空的：残留上次的搜索词会让「新建标签」拼出错误的标签词
    const pre = await js(String.raw`(() => {
      const inp = document.querySelectorAll('.ant-select')[1].querySelector('input');
      if (!inp) return { err: 'no-input' };
      if ((inp.value || '').trim()) return { err: 'dirty-input', val: inp.value };
      inp.focus(); inp.click();
      return { err: '', focused: document.activeElement === inp };
    })()`);
    if (pre && pre.err === 'dirty-input') { tagSkipped = 'dirty-search-input'; step('warn', `标签 ${t} 及后续跳过：搜索框残留 "${pre.val}"，不清空会建出拼错的标签（删除 chip 的交互未实测）`); break; }
    if (pre && pre.err === 'no-input') { tagSkipped = 'no-input'; step('warn', '标签全部跳过：select 内找不到 input'); break; }
    if (!pre || !pre.focused) { tagSkipped = 'not-focused'; step('warn', `标签 ${t} 跳过：focus 后 activeElement 不是标签 input（防打错字段）`); continue; }

    await typeText(t);
    await wait(2.5);   // SKILL.md:146/253：实测 1.5s 起才出远程搜索结果，留余量

    // 只执行一次判定+点选：再执行一次会把刚选中的 chip 点掉
    // 匹配规则同 SKILL.md:151-152：先精确 title/innerText，再 includes 兜住「新建标签: "xxx"」
    let res = await js(sub(String.raw`(() => {
      const t = new TextDecoder().decode(Uint8Array.from(atob("__T64__"), c => c.charCodeAt(0)));
      const opts = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')].filter(e => e.offsetParent !== null);
      const name = (o) => (o.getAttribute('title') || o.innerText || '').trim();
      const hit = opts.find(o => name(o) === t) || opts.find(o => name(o).includes(t));
      if (hit) { hit.click(); return 'picked:' + name(hit); }
      return 'miss:' + opts.slice(0, 6).map(name).join('|');
    })()`, '__T64__', b64of(t)));

    if ((await readTagChips()).some(x => x.toLowerCase() === t.toLowerCase())) { step('tag ' + t, res); tagDone++; }
    else {
      step('tag ' + t + ' retry', res);
      await js(String.raw`(() => { const i = document.querySelectorAll('.ant-select')[1]?.querySelector('input'); if (i) { i.focus(); i.click(); } })()`);
      await wait(0.5);
      await typeText(t);
      await wait(2.5);
      res = await js(sub(String.raw`(() => {
        const t = new TextDecoder().decode(Uint8Array.from(atob("__T64__"), c => c.charCodeAt(0)));
        const opts = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')].filter(e => e.offsetParent !== null);
        const name = (o) => (o.getAttribute('title') || o.innerText || '').trim();
        const hit = opts.find(o => name(o) === t) || opts.find(o => name(o).includes(t));
        if (hit) { hit.click(); return 'picked:' + name(hit); }
        return 'miss:' + opts.slice(0, 6).map(name).join('|');
      })()`, '__T64__', b64of(t)));
      if ((await readTagChips()).some(x => x.toLowerCase() === t.toLowerCase())) tagDone++;
      else step('warn', `标签 ${t} 两次都没入账: ${res}`);
    }

    // 每轮复核正文长度：防键入落到 #md-editor 把文章写坏
    const bodyNow = await js(String.raw`document.querySelector('textarea#md-editor')?.value.length || -1`);
    if (bodyNow !== bodyLenBaseline) fail(`键入标签后正文长度从 ${bodyLenBaseline} 变成 ${bodyNow}，输入落点异常，已中止（尚未提交，不会污染线上文章）`);
    await wait(1);
  }
}
const finalChips = tagSkipped === 'no-tag-select' ? selProbe.chips : await readTagChips();
step('tags ok', { want: tagList, got: finalChips, done: tagDone, skipped: tagSkipped || '' });
// 标签非必填（SKILL.md:68 只说 1~5 个），漏了不阻断发布
if (tagList.length && !finalChips.length) step('warn', '一个标签都没入账，博客园可无标签发布，继续');

/* ---------- 6. 个人分类：数字 id checkbox，label 文案匹配，至多一个（SKILL.md:24/177-184/235） ---------- */
// 关键防坑：页面还有 #isPublished / #post-is-aigc 等非分类 checkbox，点错就是改掉了「发布开关」或 AIGC 标记，
// 所以一律先按 /^\d+$/（数字 id）过滤，只在过滤结果里找；且已勾选就不再 click（click 是 toggle，会把已选分类取消掉）。
const catProbe = await js(String.raw`(() => {
  const cbs = [...document.querySelectorAll('input[type=checkbox]')].filter(c => /^\d+$/.test(c.id));
  return {
    available: cbs.map(c => ({ name: c.labels && c.labels[0] ? c.labels[0].innerText.trim() : '', checked: !!c.checked, id: c.id })),
    totalCheckboxes: document.querySelectorAll('input[type=checkbox]').length
  };
})()`);
const available = (catProbe.available || []).map(x => x.name).filter(Boolean);
step('category list', { available, totalCheckboxes: catProbe.totalCheckboxes, want: wantCategory });
if (!available.length) {
  // SKILL.md:24「没有匹配项就留空」：账号没建过个人分类，或改版
  step('warn', '个人分类留空：页面没有数字 id 的分类 checkbox（账号可能没建过个人分类）');
} else {
  // 分类名必须来自实测 available 列表（SKILL.md:190），不在列表里就留空，绝不硬点
  let catTarget = '';
  if (wantCategory) {
    catTarget = available.find(x => x === wantCategory)
      || available.find(x => x.toLowerCase() === wantCategory.toLowerCase())
      || available.find(x => x.includes(wantCategory) || wantCategory.includes(x)) || '';
    if (!catTarget) step('warn', `想要分类 "${wantCategory}" 不在实测列表里，留空（可选：${available.join(' / ')}）`);
  }
  if (!catTarget) {
    const text = (title + '\n' + body).toLowerCase();
    let best = '', score = 0;
    for (const a of available) { const s = text.split(a.toLowerCase()).length - 1; if (s > score) { score = s; best = a } }
    if (score > 0) catTarget = best;
  }
  const preChecked = (catProbe.available || []).filter(x => x.checked).map(x => x.name);
  if (preChecked.length && preChecked.some(x => x !== catTarget)) {
    step('warn', `页面已勾选分类 ${JSON.stringify(preChecked)}，与目标不同；取消勾选的交互未实测（「至多选一个」），本次不动它`);
  } else if (catTarget) {
    const catRes = await js(sub(String.raw`(() => {
      const want = new TextDecoder().decode(Uint8Array.from(atob("__CAT64__"), c => c.charCodeAt(0)));
      const cbs = [...document.querySelectorAll('input[type=checkbox]')].filter(c => /^\d+$/.test(c.id));
      const cb = cbs.find(c => c.labels && c.labels[0] && c.labels[0].innerText.trim() === want);
      if (!cb) return 'not-found';
      if (cb.checked) return 'already-checked';
      cb.click();
      return cb.checked ? 'checked:' + cb.id : 'no-effect';
    })()`, '__CAT64__', b64of(catTarget)));
    await wait(1);
    const after = await js(String.raw`(() => {
      const cbs = [...document.querySelectorAll('input[type=checkbox]')].filter(c => /^\d+$/.test(c.id) && c.checked);
      return { checked: cbs.map(c => c.labels && c.labels[0] ? c.labels[0].innerText.trim() : ''), bodyLen: document.querySelector('textarea#md-editor')?.value.length };
    })()`);
    step('category', { want: catTarget, res: catRes, checked: after.checked });
    if (after.bodyLen !== bodyLenBaseline) fail(`勾选分类后正文长度从 ${bodyLenBaseline} 变成 ${after.bodyLen}，点击落到了别的控件，已中止`);
    if (catRes === 'not-found' || catRes === 'no-effect') step('warn', '分类没勾上，按无个人分类发布');
  } else {
    step('category', { want: wantCategory, picked: '', note: '无匹配，留空' });
  }
}

/* ---------- 7. 摘要 / AIGC / 外链图（都可选，探测不到就 warn 跳过） ---------- */
if (summary) {
  const sSet = await setNative('textarea#summary', summary);
  if (sSet === 'no-el') step('warn', '找不到 textarea#summary，摘要留空（SKILL.md:25 摘要可选，缺省由平台截取）');
  else step('summary', sSet);
}
if (aigc) {
  const ai = await js(String.raw`(() => {
    const el = document.querySelector('#post-is-aigc');
    if (!el) return 'no-field';
    if (el.checked) return 'already-checked';
    el.click();
    return el.checked ? 'checked' : 'no-effect';
  })()`);
  step('aigc', ai);
  if (ai === 'no-field') step('warn', 'frontmatter 要 aigc，但页面没有 #post-is-aigc，跳过');
}
// 提取图片：SKILL.md:27/238 明说「完整交互链路未实测」→ 只探测、只提示，不点（点了弹什么、会不会顶掉发布按钮都不知道）
// TODO 待实测：button「提取图片」点击后的弹窗结构 / 成功提示 / 是否改写 #md-editor 正文
const imgBtn = await js(String.raw`(() => [...document.querySelectorAll('button')].some(x => x.innerText.trim() === '提取图片' && x.offsetParent !== null))()`);
if (extImgs.length) step('ext-img', { count: extImgs.length, extractBtn: imgBtn, note: imgBtn ? '「提取图片」存在但链路未实测，故未点击，裂图需人工处理' : '无「提取图片」按钮' });

/* ---------- 8. 提交前总复核 ---------- */
// 先把焦点从标签搜索框移开，避免点按钮时带着未提交的搜索词
await js(String.raw`(() => { const a = document.activeElement; if (a && a.blur) a.blur(); })()`);
await wait(0.6);
const ready = await js(String.raw`(() => {
  const s = document.querySelectorAll('.ant-select')[1];
  return {
    title: document.querySelector('input#post-title')?.value || '',
    bodyLen: document.querySelector('textarea#md-editor')?.value.length || 0,
    summary: (document.querySelector('textarea#summary')?.value || '').length,
    tags: s ? [...s.querySelectorAll('.ant-select-selection-item')].map(x => x.title || x.innerText.trim()) : [],
    cats: [...document.querySelectorAll('input[type=checkbox]')].filter(c => /^\d+$/.test(c.id) && c.checked).map(c => c.labels && c.labels[0] ? c.labels[0].innerText.trim() : ''),
    isPublished: document.querySelector('#isPublished') ? document.querySelector('#isPublished').checked : null,
    aigc: document.querySelector('#post-is-aigc') ? document.querySelector('#post-is-aigc').checked : null
  };
})()`);
step('ready', ready);
if (!ready.title) fail('复核时标题为空');
if (ready.bodyLen < body.length * 0.9) fail(`复核时正文又不完整（页面 ${ready.bodyLen} / 本地 ${body.length}）`);

/* ---------- 9. 草稿 / 直发 ---------- */
if (ARGS.mode !== 'publish') {
  // 博客园有真草稿态：button「存为草稿」入草稿箱（SKILL.md:26/240），不是「只填不提交」
  // 草稿分支绝不点「发布」，也绝不碰 #isPublished（勾上就是发布语义）
  const saved = await js(String.raw`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '存为草稿' && x.offsetParent !== null);
    if (!b) return 'not-found'; b.click(); return 'clicked';
  })()`);
  if (saved !== 'clicked') fail('找不到「存为草稿」按钮，草稿没提交（' + saved + '）');
  await wait(4);
  const dInfo = await pageInfo();
  // TODO 待实测：「存为草稿」的成功判据（URL 变化 / toast 文案）SKILL.md 只给了按钮没给判据，这里只做弱探测
  const dHint = await js(String.raw`(() => {
    const nodes = [...document.querySelectorAll('.ant-message-notice-content, .ant-notification-notice')];
    const txt = nodes.map(n => n.innerText.trim()).filter(Boolean).join(' / ');
    return txt || (document.body.innerText.match(/[^\n]{0,20}草稿[^\n]{0,20}/) || [''])[0];
  })()`).catch(() => '');
  step('draft', { btn: saved, url: dInfo.url, hint: String(dHint).trim() });
  if (dInfo.url === info.url && !String(dHint).trim()) {
    await shot();
    step('warn', '草稿成功判据未实测：URL 没变也没抓到提示，已截图，标签页留着人工核对草稿箱');
  }
  step('draft url', dInfo.url);
  step('result', 'DRAFT_OK');
  await completeTaskSpace(SPACE_USED, { keep: true }).catch(() => {});   // 留标签页给人核对
  step('done', 'ok');
} else {
  if (ready.isPublished === false) {
    // SKILL.md:26「#isPublished 默认勾选（不勾=存草稿语义）」→ 直发前确保勾上，否则点了发布也只进草稿箱
    const fix = await js(String.raw`(() => {
      const cb = document.querySelector('#isPublished');
      if (!cb) return 'no-field';
      cb.click();
      return cb.checked ? 'checked' : 'no-effect';
    })()`);
    step('isPublished', fix);
    if (fix === 'no-field') step('warn', '没有 #isPublished 字段，按页面默认语义继续');
    if (fix === 'no-effect') fail('#isPublished 勾不上，发布语义不成立，已中止');
  }
  // 点「发布」（SKILL.md:239/204 按按钮文案）：先数有几个同名按钮，防止点到侧栏/顶部同名按钮
  const pubBtns = await js(String.raw`(() => [...document.querySelectorAll('button')].filter(x => x.innerText.trim() === '发布' && x.offsetParent !== null).length)()`);
  if (!pubBtns) fail('未登录或改版：找不到「发布」按钮');
  if (pubBtns > 1) step('warn', `可见的「发布」按钮有 ${pubBtns} 个，点了第一个`);
  step('publish', await js(String.raw`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '发布' && x.offsetParent !== null);
    if (!b) return 'not-found'; b.click(); return 'clicked';
  })()`));
  // 平台校验失败的 toast 会自己消失，点完立刻先抓一份存下来（实测「相同标题的博文已存在」就是这样被错过的）
  const grabHint = () => js(String.raw`(() => {
    const nodes = [...document.querySelectorAll('.ant-message-notice-content, .ant-notification-notice-message, .ant-form-item-explain-error, .ant-modal-content')];
    return nodes.map(n => (n.innerText || '').trim()).filter(Boolean).slice(0, 6).join(' / ');
  })()`).catch(() => '');
  await wait(1.5);
  const firstHint = String(await grabHint()).trim();
  if (firstHint) step('toast', firstHint);

  // 成功判据（2026-10-05 实测修正）：点「发布」后 SPA 并不整页跳到 www.cnblogs.com/<user>/p/<id>.html，
  // 而是路由到 https://i.cnblogs.com/articles/edit-done;postId=<id>;isPublished=true，页面文案「发布成功」。
  // SKILL.md 里写的 /p/<id>.html 是这篇文章的**对外地址**，要靠 postId 自己拼 + 打开核验。
  let postId = '', link = '';
  for (let i = 0; i < 8; i++) {
    await wait(2);
    const now = await pageInfo();
    const m = (now.url.match(/articles\/edit-done[;?]postId=(\d+)/i) || [])[1];
    if (m) { postId = m; break }
    if (/www\.cnblogs\.com\/[^/]+\/p\/\d+/.test(now.url)) { link = now.url; break }
  }
  const after = await pageInfo();
  if (!postId) {
    const m2 = (after.url.match(/articles\/edit-done[;?]postId=(\d+)/i) || [])[1];
    if (m2) postId = m2;
  }
  if (!link && /www\.cnblogs\.com\/[^/]+\/p\//.test(after.url)) link = after.url;
  if (postId && !link) {
    // 注意：js() 里的函数跑在页面上下文，看不到 Node 侧变量，postId 一律从 location.href 现读
    const done = await js(String.raw`(() => {
      const home = ([...document.querySelectorAll('a')].map(a => a.href || '')
        .find(h => /^https:\/\/www\.cnblogs\.com\/[^/]+\/?$/.test(h)) || '').replace(/\/+$/, '');
      const pid = (location.href.match(/edit-done[;?]postId=(\d+)/i) || [])[1] || '';
      return { home, pid, said: /发布成功/.test(document.body.innerText || '') };
    })()`);
    link = done.home && /^\d+$/.test(String(done.pid)) ? done.home + '/p/' + done.pid + '.html' : '';
    if (done.pid && String(done.pid) !== String(postId)) step('warn', 'URL 里的 postId 与刚才读到的不一致：' + done.pid + ' vs ' + postId);
    if (!done.said) step('warn', 'URL 已是 edit-done 但页面没说「发布成功」，仍按 postId 处理');
  }
  if (link) {
    // 打开对外地址确认真能读到（匿名可读才是"已发布"）；打不开只降级为 warn，文章已经发出去了
    try {
      await openOrReuseTab(link, { wait: true, timeout: 30 });
      const chk = await js(sub(String.raw`(() => {
        const want = new TextDecoder().decode(Uint8Array.from(atob("__T64__"), c => c.charCodeAt(0)));
        const txt = (document.body.innerText || '');
        return { url: location.href, h1cls: (document.querySelector('h1') || {}).className || '',
                 h1: (document.querySelector('#cb_post_title_code, h1') || {}).innerText || '',
                 hasTitle: txt.includes(want), is404: /404|不存在/.test(document.title || '') };
      })()`, '__T64__', b64of(title)));
      step('verify', chk);
      if (chk.is404 || !chk.hasTitle) step('warn', '对外地址没能读到本文标题，稍后手动确认 ' + link);
    } catch (e) { step('warn', '对外地址核验失败（不影响发布结果）：' + e.message.split('\n')[0]) }
    step('result', 'PUBLISH_OK');
    step('link', link);
    step('postId', postId);
    await completeTaskSpace(SPACE_USED, { keep: false }).catch(() => {});   // 链接已回传，页面不用留
    step('done', 'ok');
  } else {
    // SKILL.md:214/255：还停在编辑页＝校验失败或有弹窗，先读页面提示原文再中止（不重试，避免重复投稿）
    const hint = String(await grabHint()).trim() || firstHint;
    await shot('发布被拦');
    const why = /已存在/.test(hint) ? '（博客园不允许同名文章，改个标题再发）' : '';
    fail('发布后仍停在编辑页: ' + after.url + (hint ? ' 页面提示: ' + hint + why : '（没抓到页面提示，见截图）'));
  }
}
