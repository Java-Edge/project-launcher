/* 51CTO 发文 playbook —— 由 51cto-publish skill 的实测结论逐条移植，纯确定性执行，运行期零 LLM。
   事实来源：skills/51cto-publish/SKILL.md（项目内绝对路径
             /Users/javaedge/soft/VSProjects/project-launcher/projects/md-publish/skills/51cto-publish/SKILL.md，
             2026-10 从 ~/.agents/skills/51cto-publish 迁入，原目录已删）
             references/categories.json（31 个一级分类 ID 快照，本文件内嵌）
             references/troubleshooting.md（空文 / 旧标题 / 合成点击无效等坑）
   四条实测命门（决定成败，代码按此顺序落）：
   ① 正文与标题必须在发布弹窗【关闭】状态下写入——弹窗一开 $VM.wukcontent 变 undefined，setForm 会把 content 清空，发出去是空文；
   ② 写入后必须校验 $VM.wukcontent 与 submitForm.content 双非空，两者都非空才允许点发布；
   ③ 「发布文章」「分类」「版权声明」「发布」都要真实鼠标点击（ego 的 click()；js() 里 element.click() 不触发 Vue/jQuery 委托）；
   ④ 必填：二级分类（该一级有子项时）+ 版权声明 input#staRe，漏填会静默停在发布页（URL 不变，极易误判脚本失效）。
   与 skill 的差异（桥侧约束）：不跑 scripts/prepare_article.py、不读 /tmp JSON，预处理全部内联；
   单次进程跑完，不用 @N/ref=N（js() 内只允许原生 CSS/XPath）；未登录不调 handOffTaskSpace，直接 fail。
   skill 没实测过的选择器一律标 TODO 待实测，探测不到就 step('warn',...) 跳过，不凭空编。
   bridge 会注入 ARGS：{ file, mode:'draft'|'publish', title?, tags?:[], category?, summary?, cover? } */
/*ARGS_TOKEN__*/
const { readFileSync, existsSync } = await import('node:fs');

const PLATFORM = '51cto';
const SPACE = 'mdps 51cto';
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

const EDITOR = 'https://blog.51cto.com/blogger/publish?old=1&newBloger=2';
const DRAFT_MGR = 'https://blog.51cto.com/creative-center/draft';   // 草稿箱（2026-10-05 实测：h3.title 列表，倒序）
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
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
// 页面侧统一 decodeURIComponent(escape(atob("...")))：裸 atob 会把 UTF-8 中文解坏（troubleshooting #9）
const DEC = (tok) => `decodeURIComponent(escape(atob("${tok}")))`;

/* ---------- 0. 分类表（内嵌 categories.json 快照：[pid, 一级名, [[cate_id, 二级名], ...]]） ---------- */
const CATS = [
  ['31', '后端开发', [['66', 'Python'], ['136', 'HarmonyOS'], ['15', 'Java'], ['18', 'C/C++'], ['17', '.Net'], ['67', 'Ruby'], ['68', 'Go语言'], ['69', 'R语言'], ['60', 'PHP'], ['139', 'spring boot'], ['140', '架构'], ['141', 'scala']]],
  ['30', '前端开发', [['61', 'Html/CSS'], ['62', 'JavaScript'], ['63', 'jQuery'], ['64', 'Node.js'], ['65', 'XML/XSL'], ['142', 'Vue.js'], ['143', 'React.js'], ['144', 'Webpack'], ['145', 'TypeScript']]],
  ['34', '数据库', [['146', 'Redis'], ['83', 'MySQL'], ['84', 'Oracle'], ['85', 'NoSQL'], ['130', 'SQL Server'], ['87', 'Hbase'], ['86', 'MongoDB'], ['88', 'Sybase']]],
  ['37', '移动开发', [['95', 'HTML5'], ['96', '移动测试'], ['97', '微信开发'], ['98', 'iOS'], ['99', 'Android'], ['100', 'Swift']]],
  ['36', '人工智能', [['92', '深度学习'], ['147', '数据结构与算法'], ['148', '计算机视觉'], ['149', 'PyTorch'], ['150', 'NLP'], ['151', '数据分析'], ['152', '数据挖掘'], ['153', '神经网络'], ['154', '数据可视化'], ['155', '机器学习']]],
  ['40', '服务器', [['113', 'Exchange'], ['114', 'Windows Server'], ['115', 'Lync'], ['116', 'SharePoint'], ['117', 'Nginx'], ['118', '集群'], ['119', '分布式'], ['120', '邮件服务器'], ['156', '负载均衡']]],
  ['29', '大数据', [['54', 'Hadoop'], ['55', 'Spark'], ['56', 'Storm'], ['57', 'Hive'], ['157', '数据仓库'], ['58', 'Yarn']]],
  ['28', '云计算', [['47', 'OpenStack'], ['48', '虚拟化'], ['138', 'kubernetes'], ['49', '云平台'], ['50', 'Office 365'], ['51', '云服务'], ['52', 'Docker'], ['158', '云原生']]],
  ['38', '游戏开发', []], ['19', '软件测试', []], ['32', '软件研发', []], ['39', '物联网', []], ['159', '开源', []],
  ['160', '区块链', []], ['27', '运维', []], ['35', '网络安全', []], ['33', '考试认证', []], ['41', '数字化转型', []],
  ['161', '音视频', []], ['162', '低代码', []], ['42', '办公效率', []], ['218', 'OpenClaw', []], ['43', '代码人生', []],
  ['163', 'AIGC', [['165', 'bard'], ['166', '文心一言'], ['167', 'llama'], ['168', 'stable diffusion'], ['169', 'midjourney'], ['170', 'DALL·E 2'], ['171', 'whisper'], ['172', 'copilot'], ['173', 'AI作画'], ['174', 'AI写作'], ['182', '图像生成'], ['183', '图像编辑'], ['184', '3D 模型生成'], ['185', '视频生成'], ['186', '数字人'], ['187', '视频编辑'], ['188', '配音合成'], ['189', '声音克隆'], ['190', '音频转文字'], ['191', '音频编辑']]],
  ['175', 'AI 办公', [['192', 'PPT 生成'], ['193', '表格处理'], ['194', '思维导图'], ['195', '文档工具'], ['196', '翻译工具'], ['197', '图像设计'], ['198', 'UI/UX 设计']]],
  ['176', 'AI 智能体', [['199', '办公 Agent'], ['200', '编程 Agent'], ['201', '自动化 Agent']]],
  ['177', 'AI 助手', [['202', '通用对话'], ['203', '专项助手'], ['204', '多模型聚合聊天'], ['205', '编程助手']]],
  ['178', 'AI 编程', [['206', 'AI IDE'], ['207', '代码生成'], ['208', '无代码开发'], ['209', '代码编辑']]],
  ['179', 'AI 开发平台', [['210', '无代码开发'], ['211', '大模型开发'], ['212', 'Agent 开发'], ['213', '算力平台'], ['214', '微调平台']]],
  ['180', '大模型', [['215', '多模态模型']]],
  ['181', '模型工具', [['216', '本地部署工具'], ['217', '模型调用工具']]],
];
// 一级分类关键词权重表（移植 skill 的 scripts/prepare_article.py，51CTO 专有；掘金的 8 分类表不适用）
const L1_KEYWORDS = [
  ['后端开发', ['java', 'spring', 'spring boot', 'springboot', 'jvm', '并发', '多线程', '网关', 'gateway', 'dubbo', 'rpc', 'netty', 'maven', 'gradle', 'servlet', 'mybatis', 'tomcat', 'scala', 'php', 'python', 'go语言', 'golang', '.net']],
  ['前端开发', ['vue', 'react', 'javascript', 'typescript', 'webpack', 'vite', 'css', 'html', 'node.js', 'nodejs', 'jquery', '前端', 'dom', 'sass', 'scss']],
  ['数据库', ['mysql', 'redis', 'oracle', 'mongodb', 'nosql', 'sql', '数据库', '索引', '分库分表', '事务', 'hbase', 'sql server']],
  ['移动开发', ['android', 'ios', 'swift', 'kotlin', '微信开发', 'html5', '移动端', 'flutter']],
  ['人工智能', ['机器学习', '深度学习', '神经网络', 'nlp', '计算机视觉', 'pytorch', 'tensorflow', 'transformer', '算法', '数据挖掘', '数据分析']],
  ['服务器', ['nginx', '服务器', '负载均衡', '集群', '分布式', 'windows server', '邮件服务器']],
  ['大数据', ['hadoop', 'spark', 'hive', 'storm', '数据仓库', 'yarn', 'flink', 'kafka']],
  ['云计算', ['docker', 'kubernetes', 'k8s', '云原生', 'openstack', '虚拟化', '云服务', '容器']],
  ['运维', ['运维', '监控', 'ci/cd', 'jenkins', '发布部署', 'shell', 'linux', 'ansible']],
  ['网络安全', ['安全', '漏洞', '渗透', '加密', ' firewall', 'xss', 'csrf', '防火墙']],
  ['代码人生', ['职场', '面试', '感悟', '复盘', '成长', '跳槽', '副业', '效率']],
  ['AIGC', ['aigc', 'midjourney', 'stable diffusion', '文心一言', 'copilot', 'ai作画', 'ai写作', '图像生成', '数字人', '视频生成']],
  ['AI 编程', ['ai ide', 'cursor', '代码生成', '无代码开发', 'ai 编程', '代码编辑']],
  ['AI 智能体', ['agent', '智能体', 'mcp', '自动化 agent', '编程 agent']],
  ['大模型', ['大模型', 'llm', 'gpt', 'qwen', 'deepseek', '多模态', '微调', '推理', 'rag']],
  ['AI 助手', ['ai 助手', '对话助手', '多模型聚合']],
  ['AI 开发平台', ['算力平台', '微调平台', '大模型开发', 'agent 开发']],
  ['模型工具', ['本地部署', 'ollama', 'lm studio', '模型调用']],
  ['区块链', ['区块链', '以太坊', '智能合约', 'web3']],
  ['物联网', ['物联网', 'iot', '嵌入式', '车路云', 'v2x', '路侧', 'rsu']],
  ['音视频', ['音视频', 'webrtc', 'rtmp', '流媒体', '编解码']],
  ['低代码', ['低代码', '零代码', 'nocode', 'lowcode']],
  ['考试认证', ['软考', '认证', '考试', 'pmp']],
  ['软件测试', ['测试', '自动化测', '单元测试', 'junit', 'pytest', '测试用']],
  ['数字化转型', ['数字化转型', '中台', '信息化']],
];
const TAG_KEYWORDS = ['Java', 'Spring Boot', 'Spring Cloud', '微服务', 'JVM', '并发编程', 'Netty', 'MySQL',
  'Redis', 'Kafka', 'RabbitMQ', 'Docker', 'Kubernetes', 'Nginx', 'Linux', 'Git', 'Vue', 'React', 'TypeScript',
  'JavaScript', 'Node.js', 'Webpack', '大模型', 'LLM', 'RAG', 'Transformer', '机器学习', '深度学习', 'Python',
  'Go', 'Golang', '架构', '分布式', '高并发', '性能优化', '设计模式', '运维', '监控', 'CI/CD', 'V2X', '车路云',
  'Cesium', 'WebGL', '数字孪生', 'MQTT'];

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
// 标题优先级：ARGS.title > frontmatter > 正文首个 # > 文件名（skill 同规则，51CTO 上限 100 字）
let title = (ARGS.title || fm.title || (body.match(/^\s*#\s+(.+)$/m) || [])[1]
  || ARGS.file.split('/').pop().replace(/\.(md|markdown|txt)$/i, '')).trim();
if (title.length > 100) { title = title.slice(0, 100); step('warn', '标题超 100 字，已截断') }

// 关键词统计用纯文本：去代码块 / 行内码 / 图片 / 链接语法（移植 skill 的 strip_md）
const plain = body
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/`[^`]*`/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .toLowerCase();

// 分类：ARGS.category / fm.category 可以是名字（「大模型」「后端」）或直接 pid，都不命中才按关键词打分
const wantCat = String(ARGS.category || fm.category || '').trim();
let cat = CATS.find(c => c[1] === wantCat)
  || CATS.find(c => c[0] === wantCat)
  || (wantCat ? CATS.find(c => c[1].toLowerCase().includes(wantCat.toLowerCase()) || wantCat.toLowerCase().includes(c[1].toLowerCase())) : null);
if (!cat) {
  let best = '', score = 0;
  for (const entry of L1_KEYWORDS) {
    let s = 0;
    for (const k of entry[1]) s += plain.split(k).length - 1;
    if (s > score) { score = s; best = entry[0] }
  }
  cat = CATS.find(c => c[1] === best) || CATS.find(c => c[1] === '后端开发');   // 兜底：后端开发
}
const pid = cat[0], pidName = cat[1];
// 二级：子项名在正文里打分；没命中取首个（skill：L1 有子项时必须选二级，否则被「请选择二级分类」静默拦截）
let cateId = '', cateName = '', bs = 0;
for (const ch of cat[2]) {
  const s = plain.split(ch[1].toLowerCase()).length - 1;
  if (s > bs) { bs = s; cateId = ch[0]; cateName = ch[1] }
}
if (!cateId && cat[2].length) { cateId = cat[2][0][0]; cateName = cat[2][0][1] }
const hasL2 = cat[2].length > 0;

// 标签：ARGS.tags > frontmatter tags > 受控词表打分，去重后 1~5 个（51CTO 标签必填，上限 5）
const srcTags = Array.isArray(ARGS.tags) && ARGS.tags.length ? ARGS.tags
  : String(fm.tags || '').replace(/[\[\]]/g, '').split(/[,，]/).map(x => x.trim()).filter(Boolean);
const tagList = [];
const pushTag = (t) => { if (t && tagList.length < 5 && !tagList.some(x => x.toLowerCase() === String(t).toLowerCase())) tagList.push(String(t)) };
srcTags.forEach(pushTag);
TAG_KEYWORDS.map(k => [k, plain.split(k.toLowerCase()).length - 1]).filter(x => x[1] > 0)
  .sort((a, b) => b[1] - a[1]).forEach(x => pushTag(x[0]));
if (!tagList.length) tagList.push('技术分享');

const summaryIn = String(ARGS.summary || fm.summary || fm.description || fm.abstract || '').trim();
const summary = (summaryIn || plain.replace(/[#>*|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)).slice(0, 500);
const cover = ARGS.cover || fm.cover || '';
const localImgs = (body.match(/!\[[^\]]*\]\((?!https?:)[^)]+\)/g) || []).length;
step('meta', { title, pid, pidName, cateId, cateName, hasL2, tags: tagList, mode: ARGS.mode, chars: body.replace(/\s+/g, '').length, localImgs });
if (localImgs) step('note', `正文含 ${localImgs} 张本地图片，平台无法直拉，发布后需手动补图（不阻断）`);
if (cover) {
  // TODO 待实测：封面图片上传控件的选择器（skill 只记了封面类型 radio input.img_type[name=imgtype]：1=单图 3=三图 4=无图 0=自动）
  step('note', 'ARGS.cover=' + cover + ' 未处理：封面上传控件待实测，发布后请手动补封面');
}

/* ---------- 2. 打开发布页 + 登录/模型检测 ---------- */
const task = await openSpace();
step('task space', task && task.id);
try {
  await openOrReuseTab(EDITOR, { wait: true, timeout: 40 });
} catch (e) { fail('打开发布页超时: ' + e.message) }
await wait(5);
const info = await pageInfo();
if (/home\.51cto\.com|passport|login/.test(info.url)) fail('未登录或改版：被重定向到登录页 ' + info.url);
if (!/blog\.51cto\.com\/blogger\/publish/.test(info.url)) fail('未登录或改版：没停在 51CTO 发布页 ' + info.url);
step('editor', info.url);

const has = async (sel) => {
  try { return !!(await js(sub(String.raw`(() => !!document.querySelector(__SEL__))()`, '__SEL__', JSON.stringify(sel)))) }
  catch (e) { return false }
};
async function clickReal(sel, label) {   // 51CTO 的 Vue/jQuery 委托按钮：js() 里 element.click() 无效，必须真实鼠标点击
  try { await click(sel, { label }); return 'clicked' } catch (e) { return 'error: ' + e.message }
}
const dlgDisplay = async () => {
  try { return await js(String.raw`(() => { const d = document.querySelector('.editor-dialog__wrapper'); return d ? getComputedStyle(d).display : 'missing' })()`) }
  catch (e) { return 'error' }
};
async function debugSnapshot(tag) {
  try {
    const s = await snapshotText();
    const txt = typeof s === 'string' ? s : JSON.stringify(s);
    const hit = txt.split('\n').filter(l => /发布|取消|分类|标签/.test(l)).slice(0, 6).join(' | ');
    step('snapshot ' + tag, hit || '(没抓到相关行)');
  } catch (e) { step('warn', tag + ' snapshotText 不可用: ' + e.message) }
}

const probe = await js(String.raw`(() => ({
  vm: !!window.$VM,
  changeTitle: !!(window.$VM && typeof window.$VM.changeTitleValue === 'function'),
  form: !!window.submitForm,
  engine: !!(window.engineInstance && typeof window.engineInstance.setMarkdown === 'function'),
  getText: !!(window.engineInstance && typeof window.engineInstance.getText === 'function'),
  titleInput: !!document.getElementById('title'),
  dlg: (() => { const d = document.querySelector('.editor-dialog__wrapper'); return d ? getComputedStyle(d).display : 'missing' })()
}))()`);
step('probe', probe);
if (!probe.vm || !probe.form || !probe.engine) fail('未登录或改版：window.$VM / window.submitForm / engineInstance.setMarkdown 不全（' + JSON.stringify(probe) + '）');
if (!probe.changeTitle || !probe.titleInput) fail('未登录或改版：找不到标题入口（$VM.changeTitleValue 或 input#title）');

/* ---------- 3. 弹窗必须关闭才允许写（命门 ①） ---------- */
async function ensureDialogClosed() {
  let d = await dlgDisplay();
  if (d === 'none' || d === 'missing') return true;
  step('warn', '发布弹窗开着（display=' + d + '），先关掉再写正文');
  let r = await clickReal('.close-dialog.cancel', 'close publish dialog');
  if (r !== 'clicked') r = await clickReal("xpath=//button[normalize-space(text())='取消']", 'cancel publish dialog');
  await wait(2);
  d = await dlgDisplay();
  if (d !== 'none' && d !== 'missing') { await shot(); fail('未登录或改版：发布弹窗关不掉（display=' + d + '），此时写正文会被清空'); }
  return true;
}
await ensureDialogClosed();

/* ---------- 4. 写标题：三重写入（Vue 模型 / 表单 / DOM，顺序不可变；只用 fillInput 会发布旧标题） ---------- */
const wroteTitle = await js(sub(String.raw`(() => {
  if (!window.$VM || typeof window.$VM.changeTitleValue !== 'function') return { res: 'no-vm' };
  const T = ${DEC('__T64__')};
  window.$VM.changeTitleValue({ type: "title", value: T });   // 入参是对象，传字符串无效
  window.submitForm.title = T;
  document.getElementById('title').value = T;
  return { res: 'ok' };
})()`, '__T64__', b64(title)));
if (wroteTitle.res !== 'ok') fail('未登录或改版：标题三重写入失败（' + wroteTitle.res + '）');
await wait(1);
const tchk = await js(String.raw`(() => ({
  vmTitle: (window.$VM && window.$VM.title && window.$VM.title.titleValue) || '',
  formTitle: (window.submitForm && window.submitForm.title) || '',
  domTitle: (document.getElementById('title') || {}).value || ''
}))()`);
if (tchk.vmTitle !== title || tchk.formTitle !== title || tchk.domTitle !== title) fail('标题三处不一致（否则发出去是旧标题）: ' + JSON.stringify(tchk));
step('title ok', tchk);

/* ---------- 5. 写正文：am-engine 原生 setMarkdown 直接吃 Markdown 源码（非 CodeMirror/textarea）+ 回读校验 ---------- */
const B64 = b64(body);
const writeBody = () => js(sub(String.raw`(() => {
  if (!window.engineInstance || typeof window.engineInstance.setMarkdown !== 'function') return 'no-engine';
  window.engineInstance.setMarkdown(${DEC('__B64__')});
  return 'ok';
})()`, '__B64__', B64));
const readBody = () => js(sub(String.raw`(() => {
  const md = ${DEC('__B64__')};
  const n = (s) => String(s).replace(/\s+/g, '');
  const wuk = (window.$VM && window.$VM.wukcontent) || '';
  const form = (window.submitForm && window.submitForm.content) || '';
  const txt = (window.engineInstance && typeof window.engineInstance.getText === 'function') ? window.engineInstance.getText() : '';
  const nw = n(wuk), nm = n(md);
  return { expectedLen: nm.length, vmLen: nw.length, formLen: n(form).length, engineLen: n(txt).length,
    rawWuk: wuk.length, rawForm: form.length,
    head: wuk.slice(0, 24), tail: wuk.slice(-24),
    headOk: nm.length < 16 || nw.includes(nm.slice(0, 16)), tailOk: nm.length < 16 || nw.includes(nm.slice(-16)) };
})()`, '__B64__', B64));

let bodyV = null;
for (let i = 1; i <= 2; i++) {
  const w = await writeBody();
  if (w !== 'ok') fail('未登录或改版：找不到 window.engineInstance.setMarkdown（' + w + '）');
  await wait(4);   // setMarkdown → $VM.wukcontent 回填需要时间，skill 实测取 4s
  const v = await readBody();
  step('body try ' + i, v);
  if (v.vmLen > 0 && v.engineLen > 0) {
    // submitForm.content 只在开弹窗/提交瞬间由 setForm 从 wukcontent 回填，这里为空属正常，开弹窗后复核（命门 ②）
    if (v.formLen <= 0) step('warn', 'submitForm.content 仍为空，开弹窗后复核');
    if (!v.headOk || !v.tailOk) step('warn', '正文首/尾片段没在回读内容里找到，请人工核对: ' + JSON.stringify({ head: v.head, tail: v.tail }));
    if (v.vmLen < v.expectedLen * 0.6) step('warn', `正文回读长度 ${v.vmLen} 远小于本地 ${v.expectedLen}，疑似截断`);
    bodyV = v;
    break;
  }
  step('warn', '第 ' + i + ' 次 setMarkdown 后 wukcontent/engine 仍为空，确认弹窗关闭后重写');
  await ensureDialogClosed();
}
if (!bodyV) { await shot(); fail('正文注入静默失败：$VM.wukcontent 与 engineInstance.getText() 都是空'); }
step('body ok', bodyV);

/* ---------- 6. 打开发布弹窗（命门 ③：真实点击） ---------- */
// TODO 待实测：「发布文章」按钮的稳定 CSS 选择器（skill 只写「顶部『发布文章』按钮」+ snapshotText 取 ref），
// 这里先按文本探元素拿 tag/class/id 拼 CSS，拿不到再退文本 XPath；全落空就 step('warn') 跳过弹窗内步骤。
async function findPublishBtn() {
  const cands = await js(String.raw`(() => {
    const els = [...document.querySelectorAll('button,a,div,span')].filter(e => e.offsetParent !== null && (e.innerText || '').trim() === '发布文章');
    return els.map(e => ({ tag: e.tagName.toLowerCase(), cls: String(e.className || '').trim(), id: e.id || '' })).slice(0, 6);
  })()`);
  if (!cands.length) return null;
  const pick = cands.find(e => /btn|release|publish/i.test(e.cls)) || cands.find(e => e.id) || cands[0];
  const sel = pick.id ? '#' + pick.id : (pick.cls ? pick.tag + '.' + pick.cls.split(/\s+/)[0] : null);
  return { sel, pick, n: cands.length };
}
async function openDialog() {
  for (let round = 1; round <= 2; round++) {
    const btn = await findPublishBtn();
    if (!btn) { step('warn', 'TODO 待实测：找不到「发布文章」按钮（第 ' + round + ' 轮）'); return false }
    step('publish btn', { round, sel: btn.sel || 'xpath', tag: btn.pick.tag, cls: btn.pick.cls, cands: btn.n });
    const r = await clickReal(btn.sel || "xpath=//button[normalize-space(text())='发布文章']", 'click publish article button');
    if (/^error/.test(r)) await clickReal("xpath=//" + btn.pick.tag + "[normalize-space(text())='发布文章']", 'retry open publish dialog');
    await wait(3);
    const d = await dlgDisplay();
    step('dialog display', d);
    if (d !== 'none' && d !== 'missing' && d !== 'error') return true;
  }
  return false;
}
const dialogOpen = await openDialog();
if (!dialogOpen) await debugSnapshot('no-dialog');

/* ---------- 7. 复核（命门 ②）：弹窗打开后 content 必须被 setForm 回填，双非空才允许继续 ---------- */
if (dialogOpen) {
  const v2 = await readBody();
  step('body after dialog', v2);
  if (v2.rawWuk <= 0 || v2.rawForm <= 0) fail('正文没同步进表单：弹窗打开后 $VM.wukcontent=' + v2.rawWuk + ' submitForm.content=' + v2.rawForm + '，此时发布就是空文');
}

if (dialogOpen) {
  /* ---------- 8. 分类（必填，先一级后二级：点一级会清空 cate_id 并重拉二级列表） ---------- */
  let usePid = pid, useName = pidName, l1sel = `.select_item[value="${pid}"]`;
  if (!(await has(l1sel))) {
    // categories.json 快照的 pid 与线上 DOM 对不上 → 现场按分类名打分选一项（探测式，不凭空编选择器）
    const live = await js(String.raw`(() => [...document.querySelectorAll('#oneLever .select_item, .select_item')]
      .map(e => ({ value: e.getAttribute('value') || '', text: (e.innerText || '').trim() })).filter(e => e.text && e.value))()`);
    let best = null, sc = 0;
    for (const e of live) {
      const k = e.text.toLowerCase();
      let s = 0;
      if (wantCat && (k === wantCat.toLowerCase() || k.includes(wantCat.toLowerCase()))) s += 10;
      if (k === pidName.toLowerCase() || pidName.toLowerCase().includes(k) || k.includes(pidName.toLowerCase())) s += 6;
      if (plain.includes(k)) s += 3;
      if (s > sc) { sc = s; best = e }
    }
    if (best && sc > 0) {
      step('warn', `快照 pid=${pid}(${pidName}) 不在页面，改用现场分类 ${best.text}(value=${best.value})`);
      usePid = best.value; useName = best.text; l1sel = `.select_item[value="${best.value}"]`;
    } else {
      // TODO 待实测：分类 DOM 与快照都对不上（可能改版）
      step('warn', `一级分类 ${pidName}(pid=${pid}) 不在页面，现场也没打分出来（页面共 ${live.length} 项），跳过分类`);
      usePid = '';
    }
  }
  if (usePid) {
    step('category l1', { want: useName + '|' + usePid, res: await clickReal(l1sel, 'select level-1 category') });
    await wait(2.5);   // 等二级分类 AJAX 回填
  }
  if (usePid && usePid === pid && hasL2) {
    // 仍用快照 pid 时才信任快照 cate_id
    const l2sel = `.second-types-item[value="${cateId}"]`;
    let picked = cateId, res = 'skip';
    if (!(await has(l2sel))) {
      const first = await js(String.raw`(() => { const e = document.querySelector('#twoLever .second-types-item') || document.querySelector('.second-types-item'); return e ? (e.getAttribute('value') || '') : '' })()`);
      if (first) { step('warn', `二级 ${cateName}(cate_id=${cateId}) 没命中，取页面首个 value=${first}`); picked = first }
      else { step('warn', 'TODO 待实测：页面没渲染任何 .second-types-item（二级列表可能没加载），跳过二级'); picked = '' }
    }
    if (picked) { res = await clickReal(`.second-types-item[value="${picked}"]`, 'select level-2 category'); await wait(1.5) }
    step('category l2', { want: cateId, use: picked, res });
  } else if (usePid && usePid !== pid) {
    // 现场换了一级分类：有子项就必须选二级，取页面首个
    const first2 = await js(String.raw`(() => { const e = document.querySelector('#twoLever .second-types-item') || document.querySelector('.second-types-item'); return e ? (e.getAttribute('value') || '') : '' })()`);
    if (first2) { step('category l2', { res: await clickReal(`.second-types-item[value="${first2}"]`, 'select fallback level-2'), use: first2 }); await wait(1.5) }
    else step('category l2', '现场分类下没渲染二级项，跳过二级');
  } else {
    step('category l2', `${pidName} 无二级分类，跳过（属正常）`);
  }
  const catChk = await js(String.raw`(() => ({
    l1: [...document.querySelectorAll('#oneLever .select_item')].filter(e => e.className.includes('check')).map(e => e.innerText.trim()),
    l2: [...document.querySelectorAll('#twoLever .second-types-item')].filter(e => e.className.includes('check')).map(e => e.innerText.trim()),
    pid: (window.submitForm || {}).pid, cate_id: (window.submitForm || {}).cate_id
  }))()`);
  step('category ok', catChk);
  if (usePid && !catChk.pid) step('warn', '点了但 submitForm.pid 仍为空，分类没选上，发布会被拦');
  else if (catChk.pid && hasL2 && !catChk.cate_id) step('warn', '该一级分类有子项但 submitForm.cate_id 为空，会被「请选择二级分类」静默拦截');

  /* ---------- 9. 标签（chip DOM 直写；只认 chip，不看 submitForm.tag —— 实测提交瞬间才回填） ---------- */
  const TAGS64 = b64(JSON.stringify(tagList.slice(0, 5)));
  const tagsRes = await js(sub(String.raw`(() => {
    const box = document.querySelector('.has-list.tage-list-arr');
    if (!box) return 'no-tag-box';
    box.textContent = '';
    const tags = JSON.parse(${DEC('__TAGS64__')});
    tags.forEach(t => {
      // chip 结构固定 <span>文本<i class="iconeditor editorcancel"></i></span>；用 textContent 建，不把标签文本当 HTML 解析
      const s = document.createElement('span');
      s.textContent = t;
      const i = document.createElement('i');
      i.className = 'iconeditor editorcancel';
      s.appendChild(i);
      box.appendChild(s);
    });
    return JSON.stringify([...box.querySelectorAll('span')].map(e => e.textContent.trim()).filter(Boolean));
  })()`, '__TAGS64__', TAGS64));
  if (tagsRes === 'no-tag-box') {
    // TODO 待实测：标签容器（skill 记为 .has-list.tage-list-arr，两个 class 同一元素）
    step('warn', '找不到标签容器 .has-list.tage-list-arr，跳过标签（51CTO 标签必填，直发可能被拦）');
  } else {
    const chips = JSON.parse(tagsRes);
    step('tags ok', chips);
    if (chips.length !== tagList.slice(0, 5).length) step('warn', '标签 chip 数量与预期不一致: ' + chips.length);
    if (ARGS.mode === 'publish' && !chips.length) fail('标签必填但一个都没写进去（chip 容器为空）');
  }

  /* ---------- 10. 版权声明（必填；展开与点选必须同一次调用，跨调用会失焦关闭） ---------- */
  step('copyright open', await clickReal('#staRe', 'open copyright dropdown'));
  await wait(1.5);
  const cpyRes = await js(String.raw`(() => {
    const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null);
    const want = ['转载请注明出处', '原创', '作者所有'];
    const t = want.map(w => items.find(e => e.innerText.trim() === w)).find(Boolean) || items[0];
    if (!t) return 'no-item:' + items.length;
    t.click();   // el-select 的选项原生 click 就能触发 Vue 选择（skill 实测）
    return 'clicked:' + t.innerText.trim();
  })()`);
  await wait(1);
  const cpy = await js(String.raw`(() => ({ val: (document.getElementById('staRe') || {}).value || '', copy_code: (window.submitForm || {}).copy_code }))()`);
  step('copyright', { res: cpyRes, val: cpy.val, copy_code: cpy.copy_code });
  if (!cpy.val) {
    if (ARGS.mode === 'publish') fail('必填项没选中：版权声明 #staRe 仍为空，发布会被「请选择版权声明」静默拦截（URL 不变，别误判成脚本失效）');
    step('warn', '版权声明 #staRe 仍为空（草稿不受影响）');
  }

  /* ---------- 11. 摘要（可选；缺省 51CTO 自动取正文前 200 字，上限 500） ---------- */
  if (summary) {
    const absRes = await js(sub(String.raw`(() => {
      const ta = document.getElementById('abstractData');
      if (!ta) return 'no-field';
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      set.call(ta, ${DEC('__ABS64__')});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`, '__ABS64__', b64(summary)));
    const absBack = await js(String.raw`(() => ((document.getElementById('abstractData') || {}).value || '').length)`);
    step('abstract', { res: absRes, len: absBack });
    if (absRes === 'no-field') step('warn', 'TODO 待实测：摘要 textarea#abstractData 没找到，摘要交给平台自动生成');
  }
} else if (ARGS.mode !== 'publish') {
  step('warn', '弹窗没打开：分类/标签/版权声明跳过，草稿只保证标题 + 正文');
}

/* ---------- 12. 发布前复核（同时探测博客用户名，供拼文章外链；发布后整页跳转就读不到了） ---------- */
const ready = await js(String.raw`(() => {
  const reserved = /^(blogger|creative-center|category|index|home|login|passport|app|web|all|follow|settings|topic|article|study|school|job|train|notify|space|user|out|src|static)$/i;
  let user = '';
  for (const a of document.querySelectorAll('a[href]')) {
    const m = (a.getAttribute('href') || '').match(/^https?:\/\/blog\.51cto\.com\/([A-Za-z0-9_.\-\u4e00-\u9fa5]+)\/?(\?|#|$)/);
    if (m && !reserved.test(m[1])) { user = m[1]; break }
  }
  const f = window.submitForm || {};
  return {
    title: f.title, pid: f.pid, cate_id: f.cate_id,
    contentLen: (f.content || '').length,
    vmLen: ((window.$VM || {}).wukcontent || '').length,
    tags: [...document.querySelectorAll('.has-list.tage-list-arr span')].map(e => e.textContent.trim()),
    copyright: (document.getElementById('staRe') || {}).value || '',
    abstract: ((document.getElementById('abstractData') || {}).value || '(自动)'),
    blog_type: f.blog_type, is_hide: f.is_hide, user
  };
})()`);
step('ready', ready);
// TODO 待实测：头像/用户名链接的选择器（skill 只说「从编辑器页头像链接读取」），探测不到就退回成功页 URL
if (!ready.user) step('warn', '没探到博客用户名，文章外链可能退化成成功页 URL');

if (ARGS.mode !== 'publish') {
  /* ---------- 13a. 草稿：绝不点「发布」；有显式存草稿按钮就真实点一次，再关弹窗（发布页本身会自动保存草稿） ---------- */
  const draftBtnText = await js(String.raw`(() => {
    const b = [...document.querySelectorAll('button,a')].find(x => x.offsetParent !== null && /^(保存草稿|存草稿|存为草稿)$/.test((x.innerText || '').trim()));
    return b ? b.innerText.trim() : '';
  })()`);
  let saved = 'no-draft-button';
  if (draftBtnText) saved = await clickReal("xpath=//button[normalize-space(text())='" + draftBtnText + "']", 'click save draft');
  let closed = 'no-dialog';
  if (dialogOpen) {
    closed = await clickReal('.close-dialog.cancel', 'close dialog keep draft');
    if (closed !== 'clicked') closed = await clickReal("xpath=//button[normalize-space(text())='取消']", 'cancel dialog keep draft');
    await wait(2.5);
    closed += ' display=' + await dlgDisplay();
  }
  step('draft', { saved, closed, note: '标题/正文/分类/标签已写入，51CTO 发布页会自动保存到草稿箱' });
  step('draft url', (await pageInfo()).url);
  /* 核验（2026-10-05 实测）：草稿箱 https://blog.51cto.com/creative-center/draft，
     每条是 h3.title，文本形如「标题 2026-10-05 23:12」，按倒序排列，本页没有分页前的空壳问题。
     没在列表里读到标题就不能算 DRAFT_OK —— 自动保存是「大概会」，不能当结论。 */
  await openOrReuseTab(DRAFT_MGR, { wait: true, timeout: 35 }).catch(e => step('warn', '打不开草稿箱: ' + e.message.split('\n')[0]));
  await wait(3);
  const inBox = await js(sub(String.raw`(() => {
    const t = decodeURIComponent(escape(atob("__TB64__")));
    const items = [...document.querySelectorAll('h3.title')].map(e => (e.innerText || '').replace(/\s+/g, ' ').trim());
    return {
      hit: items.some(x => x.indexOf(t) !== -1),
      head: items.slice(0, 3),
      total: ((document.body.innerText || '').match(/草稿箱 ?[(（](\d+)/) || [])[1] || '',
      url: location.href,
    };
  })()`, '__TB64__', b64(title)));
  step('draft check', inBox);
  if (!inBox.hit) {
    await shot('草稿箱没见到本文');
    fail('草稿箱里没有这篇文章（' + DRAFT_MGR + '）——51CTO 的自动保存没接管，草稿不算成功');
  }
  step('result', 'DRAFT_OK');
  step('note', '已在草稿箱核验到标题（' + (inBox.total ? '共 ' + inBox.total + ' 条' : '列表已匹配') + '）');
  await completeTaskSpace(SPACE_USED, { keep: true }).catch(() => {});   // 留标签页给人核对
} else {
  /* ---------- 13b. 直发 ---------- */
  if (!dialogOpen) fail('未登录或改版：发布弹窗打不开，无法提交');
  await shot();   // 不可逆动作留证
  step('publish', await clickReal('button.release', 'click publish button'));
  await wait(3);
  // 违禁词二次确认（命中敏感词才会出现）
  const cont = await js(String.raw`(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '继续发布' && e.offsetParent !== null);
    return b ? 'need-confirm' : 'none';
  })()`);
  step('banned-dialog', cont);
  if (cont === 'need-confirm') {
    step('continue', await clickReal('xpath=//button[normalize-space(text())="继续发布"]', 'confirm continue publish'));
    await wait(4);
  }
  await wait(2);
  // 发布后整页跳转：只用 pageInfo().url 判定，别再查 .editor-dialog__wrapper（会抛 parameter 1 is not of type 'Element'）
  const after = await pageInfo();
  step('after', after.url);
  const articleId = (after.url.match(/\/blogger\/success\/(\d+)/) || [])[1] || '';
  let link = articleId && ready.user ? `https://blog.51cto.com/${ready.user}/${articleId}` : '';
  if (!link && articleId) {
    try {
      link = await js(sub(String.raw`(() => {
        const needle = __NEEDLE__;
        const a = [...document.querySelectorAll('a[href]')].find(x => x.href.indexOf(needle) >= 0 && !/\/blogger\/success\//.test(x.href));
        return a ? a.href : '';
      })()`, '__NEEDLE__', JSON.stringify('/' + articleId)));
    } catch (e) { step('warn', '文章链接探测失败: ' + e.message) }
  }
  if (articleId || /发布成功/.test(String(after.title || ''))) {
    step('result', 'PUBLISH_OK');
    step('link', link || after.url);
    await completeTaskSpace(SPACE_USED, { keep: false }).catch(() => {});
  } else {
    let hint = 'no-hint';
    try {
      hint = await js(String.raw`(() => {
        const t = (document.body.innerText || '').replace(/\s+/g, ' ');
        const m = t.match(/(请选择[^，。]{0,10}|发布失败|审核中|敏感词|验证码)[^。]{0,24}/g);
        return m ? [...new Set(m)].slice(0, 5).join(' / ') : 'no-hint';
      })()`);
    } catch (e) { hint = 'error' }
    await shot();
    fail('点了发布仍没跳到 /blogger/success/<id>，停在 ' + after.url + '；页面提示：' + hint + '（实测必填项漏填就是这个表现）');
  }
}
step('done', 'ok');
