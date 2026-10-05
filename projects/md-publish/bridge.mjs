#!/usr/bin/env node
/* 本地执行桥：页面 → http://127.0.0.1:8096 → ego-browser playbook（确定性选择器脚本，零 LLM）
   只监听 127.0.0.1；playbook 白名单 = playbooks/*.js；任务串行（共用一个浏览器）。 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8096);
const PB_DIR = path.join(ROOT, 'playbooks');
const LOG_DIR = path.join(ROOT, 'logs');
const EGO = process.env.EGO_BIN || 'ego-browser';
const TIMEOUT = Number(process.env.JOB_TIMEOUT_MS || 10 * 60 * 1000);
const OK_EXT = new Set(['.md', '.markdown', '.txt']);
const MODES = new Set(['draft', 'publish']);
const ARGS_TOKEN = '/*ARGS_TOKEN__*/';

const playbooks = () => fs.readdirSync(PB_DIR).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
const jobs = new Map();
const queue = [];
let running = false;
let seq = 0;

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a) }

function enqueue(spec) {
  const job = {
    id: ++seq, platform: spec.platform, mode: spec.mode, file: spec.file,
    state: 'queued', steps: [], result: '', link: '', started: Date.now(), ended: 0, exit: null
  };
  jobs.set(job.id, job);
  queue.push({ job, spec });
  pump();
  return job;
}

function buildScript(job, spec) {
  const src = fs.readFileSync(path.join(PB_DIR, job.platform + '.js'), 'utf8');
  const args = {
    file: spec.file, mode: spec.mode, title: spec.title || '', tags: spec.tags || [],
    category: spec.category || '', summary: spec.summary || '', cover: spec.cover || ''
  };
  // 用 JSON.stringify 注入参数：所有引号/换行/反斜杠都由 JSON 负责转义，playbook 里不再拼字符串
  if (!src.includes(ARGS_TOKEN)) throw new Error(`${job.platform}.js 缺少参数注入点 ${ARGS_TOKEN}`);
  return src.replace(ARGS_TOKEN, 'const ARGS = ' + JSON.stringify(args) + ';');
}

async function pump() {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  running = true;
  const { job, spec } = next;
  job.state = 'running';
  let script = '';
  try {
    script = buildScript(job, spec);
  } catch (e) {
    job.result = 'FAILED'; job.state = 'error'; job.ended = Date.now(); job.exit = null;
    job.steps.push('bridge: ' + e.message);
    running = false; log(`#${job.id} ${job.platform} 脚本准备失败: ${e.message}`);
    pump(); return;
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `job-${job.id}-${job.platform}.log`);
  log(`#${job.id} ${job.platform} ${job.mode} 起进程`);

  const child = spawn(EGO_BIN, ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const timer = setTimeout(() => { log(`#${job.id} 超时，杀掉`); child.kill('SIGKILL') }, TIMEOUT);
  let buf = '';
  const onData = (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      job.steps.push(line);
      const m = line.match(/^\[\w+\] (result|link|FAILED): (.*)$/);
      if (m && m[1] === 'result') job.result = m[2];
      if (m && m[1] === 'link') job.link = m[2];
      if (m && m[1] === 'FAILED') job.result = 'FAILED';
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', (d) => onData(d));
  const out = fs.createWriteStream(logPath);
  child.stdout.pipe(out); child.stderr.pipe(out);
  child.stdin.end(script);

  child.on('close', (code) => {
    clearTimeout(timer);
    out.end();
    job.exit = code;
    job.ended = Date.now();
    if (!job.result) job.result = code === 0 ? 'NO_RESULT' : 'FAILED';
    job.state = code === 0 && /_OK$/.test(job.result) ? 'done' : 'error';
    running = false;
    log(`#${job.id} ${job.platform} → ${job.state} (${job.result}) exit=${code} 日志 ${path.relative(ROOT, logPath)}`);
    pump();
  });
  child.on('error', (e) => {
    clearTimeout(timer);
    job.state = 'error'; job.result = 'SPAWN_FAILED'; job.steps.push('spawn error: ' + e.message);
    running = false; log(`#${job.id} 起进程失败: ${e.message}`); pump();
  });
}

function readBody(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 2e6) { rej(new Error('body too large')); req.destroy() } });
    req.on('end', () => { try { res(b ? JSON.parse(b) : {}) } catch (e) { rej(e) } });
    req.on('error', rej);
  });
}
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)) };
const view = (j) => ({ id: j.id, platform: j.platform, mode: j.mode, state: j.state, result: j.result, link: j.link, exit: j.exit, started: j.started, ended: j.ended, steps: j.steps.slice(-40) });

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const allowed = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  res.setHeader('access-control-allow-origin', allowed ? origin : 'http://127.0.0.1:8095');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/status') {
      return send(res, 200, {
        ok: true, ego: EGO_BIN, playbooksReady: playbooks().length > 0, port: PORT,
        playbooks: playbooks(), queue: queue.length, running
      });
    }
    if (url.pathname === '/api/jobs') {
      const list = [...jobs.values()].sort((a, b) => b.id - a.id).map(view);
      return send(res, 200, { ok: true, jobs: list, queue: queue.length });
    }
    if (url.pathname === '/api/jobs/clear' && req.method === 'POST') {
      for (const [k, v] of jobs) if (v.state !== 'running') jobs.delete(k);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/publish' && req.method === 'POST') {
      const b = await readBody(req);
      const pb = playbooks();
      if (!pb.includes(b.platform)) return send(res, 400, { ok: false, error: '没有该平台 playbook：' + b.platform + '（可用：' + pb.join(', ') + '）' });
      const file = path.resolve(String(b.file || ''));
      if (!OK_EXT.has(path.extname(file).toLowerCase())) return send(res, 400, { ok: false, error: '只接受 .md/.markdown/.txt' });
      if (!fs.existsSync(file)) return send(res, 400, { ok: false, error: '文件不存在: ' + file });
      if (!MODES.has(b.mode)) return send(res, 400, { ok: false, error: 'mode 只能是 draft 或 publish' });
      const spec = {
        platform: b.platform, file, mode: b.mode,
        title: String(b.title || '').slice(0, 300), category: String(b.category || ''),
        summary: String(b.summary || '').slice(0, 1000), cover: String(b.cover || ''),
        tags: (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(/[,，]/)).map(x => String(x).trim()).filter(Boolean).slice(0, 3)
      };
      const job = enqueue(spec);
      return send(res, 202, { ok: true, job: view(job) });
    }
    return send(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return send(res, 500, { ok: false, error: e.message });
  }
});

function spawnSyncPath() {
  // 不经 shell：绝对路径直接查；裸名字则扫 PATH 找可执行文件（避免把 EGO 拼进 shell 命令串）
  if (path.isAbsolute(EGO)) return fs.existsSync(EGO) ? EGO : '';
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    const c = path.join(d, EGO);
    try {
      if (!fs.statSync(c).isFile()) continue;
      fs.accessSync(c, fs.constants.X_OK);   // 失败会 throw，成功返回 undefined
      return c;
    } catch {}
  }
  return '';
}

const EGO_BIN = spawnSyncPath() || EGO;

server.listen(PORT, '127.0.0.1', () => {
  log(`执行桥已启动 http://127.0.0.1:${PORT} · playbook: ${playbooks().join(', ') || '（空）'} · ego: ${EGO_BIN}`);
});
