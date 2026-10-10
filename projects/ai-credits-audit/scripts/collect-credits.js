// ego-browser 采集脚本 —— 积分证据收集
//
// ego-browser 的 CLI 只接受一个 source 参数（`nodejs <script>` 或 `nodejs -e`），
// 没法跟脚本路径一起传参，所以配置走环境变量。
//
// 用法（任意 cwd 均可）：
//   ego-browser nodejs "$SKILL/scripts/collect-credits.js"
//   COLLECT_ONLY=trae-cn,qoder ego-browser nodejs "$SKILL/scripts/collect-credits.js"
//   COLLECT_OUT=/tmp/xxx   ego-browser nodejs "$SKILL/scripts/collect-credits.js"
//   COLLECT_PROBE=1        ego-browser nodejs "$SKILL/scripts/collect-credits.js"   # 只探登录态
//
// 设计取舍：
//   自动化的只是「机械部分」——导航 + 抓 DOM 文本 + 落盘证据。
//   「判断部分」——解析余额、反推签到、交叉验证口径冲突 —— 交给 agent，
//   因为 6 家平台的 DOM 各不相同，全自动正则解析必然脆。
//   抓不到的 / 没登录的，脚本如实标记 status，交由 agent 补登或标注未确认。

const fs = require("fs");
const DEFAULT_SKILL = `${process.env.HOME}/soft/VSProjects/project-launcher/projects/ai-credits-audit`;
// 常驻的 ego-browser 进程可能带着迁移前的旧 SKILL 环境变量，目录已不存在时回退默认路径
const SKILL = (process.env.SKILL && fs.existsSync(process.env.SKILL))
  ? process.env.SKILL
  : DEFAULT_SKILL;
const OUT = process.env.COLLECT_OUT || `${SKILL}/data/raw`;
const ONLY = (process.env.COLLECT_ONLY || "").split(",").filter(Boolean);
const PROBE = process.env.COLLECT_PROBE === "1";

// 各平台的采集点。path 需配合 references/platforms.md 的余额页路径。
const TARGETS = [
  { id: "trae-cn",  name: "Trae CN",  url: "https://www.trae.cn/dashboard",
    grab: ["总可用积分", "每日签到", "通用积分", "Work 专属积分", "到期"],
    expand: "text=每日签到" },
  { id: "qoder",    name: "Qoder",    url: "https://qoder.com/account/usage",
    grab: ["订阅版本的资源", "个人资源包", "获赠资源包", "剩余", "有效期至", "credits"] },
  { id: "coze",     name: "扣子 Coze", url: "https://www.coze.cn/space",
    grab: ["总积分", "积分", "套餐"] },
  { id: "minimax",  name: "MiniMax",  url: "https://agent.minimax.cn/",
    grab: ["每日签到", "连续签到", "积分", "升级套餐"] },
  { id: "manus",    name: "Manus",    url: "https://manus.im/app",
    grab: ["积分", "额度", "usage", "credit"] },
  { id: "doubao",   name: "豆包",      url: "https://www.doubao.com/chat/",
    grab: ["积分", "额度"] },
  { id: "codebuddy",name: "CodeBuddy",url: "https://www.codebuddy.cn/home/",
    grab: ["积分", "额度", "套餐"] },
  { id: "sensetime",name: "商汤商量",  url: "https://chat.sensetime.com/",
    grab: ["积分", "points", "额度"] },
  { id: "freebuff",  name: "Freebuff",  url: "https://freebuff.com/dashboard",
    grab: ["Freebucks", "freebucks", "余额", "额度", "credits", "balance", "hours"] },
];

// 登录页判定。
// 教训：只匹配「登录 / Sign in」会漏掉 OAuth 风格的 CTA ——
// Freebuff 未登录时显示的是 "Continue with GitHub / Google / Apple"，
// 被误判成「已登录但无数据」，静默产出空结果。所以必须覆盖：
//   中文：登录 / 注册 / 立即登录
//   英文：Sign in / Sign up / Log in
//   OAuth：Continue with Xxx / Get started with Xxx
const LOGIN_RE = new RegExp(
  "^(登录|登录/注册|登录/註冊|注册|立即登录|马上登录|登录怎么又失败了" +
  "|sign in|sign up|log in|login|continue with |get started with |" +
  "登录以.{0,6}|使用\\s*(Google|GitHub|Apple|微信|手机号).{0,4}登录)" +
  "",
  "i"
);

async function isLoggedIn(page) {
  const lines = (await page.evaluate(() => document.body.innerText || ""))
    .split("\n").map(s => s.trim()).filter(Boolean);
  return {
    loggedIn: !lines.some(l => LOGIN_RE.test(l)),
    loginHits: lines.filter(l => LOGIN_RE.test(l)).slice(0, 3),
  };
}

async function main() {
  const fs = await import("node:fs/promises");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  await fs.mkdir(OUT, { recursive: true });

  const list = ONLY.length ? TARGETS.filter(t => ONLY.includes(t.id)) : TARGETS;
  console.log(`采集 ${list.length} 个平台 → ${OUT}`);

  const task = await taskSpace("ai-credits-collect");
  console.log(`taskSpace: ${task.spaceId}`);

  const results = [];
  for (const t of list) {
    const rec = { id: t.id, name: t.name, url: t.url, at: new Date().toISOString() };
    let page;
    try {
      // Page 预算有限，用完即关
      page = task.newPage ? await task.newPage() : task.page("p1");
      await page.goto(t.url);
      await page.waitForTimeout(3200);

      Object.assign(rec, await isLoggedIn(page));

      if (PROBE) {
        rec.hits = [];
        rec.status = rec.loggedIn ? "logged-in" : "need-login";
        console.log(`  ${rec.status.padEnd(20)} ${t.name}`);
        results.push(rec);
        if (page && page.close) { try { await page.close(); } catch {} }
        continue;
      }

      if (t.expand && rec.loggedIn) {
        // Trae 的签到明细是 accordion，要展开才能拿到逐笔到期日
        try { await page.click(t.expand); await page.waitForTimeout(1500); } catch {}
      }

      const text = await page.evaluate(() => document.body.innerText || "");
      rec.fullText = text.slice(0, 6000);
      rec.hits = (await page.evaluate(() => document.body.innerText || ""))
        .split("\n").map(s => s.trim())
        .filter(s => s && s.length < 140)
        .filter(s => new RegExp(t.grab.join("|"), "i").test(s))
        .slice(0, 60);

      rec.status = rec.loggedIn ? (rec.hits.length ? "ok" : "logged-in-no-data") : "need-login";
      console.log(`  ${rec.status.padEnd(20)} ${t.name}${rec.loginHits?.length ? "  ← " + rec.loginHits[0] : ""}`);
    } catch (e) {
      rec.status = "error";
      rec.error = e.message;
      console.log(`  error               ${t.name}: ${e.message}`);
    }
    results.push(rec);
    if (page && page.close) { try { await page.close(); } catch {} }
  }

  const file = `${OUT}/collect-${stamp}.json`;
  await fs.writeFile(file, JSON.stringify({
    collectedAt: new Date().toISOString(),
    taskSpaceId: task.spaceId,
    targets: results.length,
    results,
  }, null, 2));

  const need = results.filter(r => r.status === "need-login").map(r => r.name);
  const bad  = results.filter(r => r.status === "ok" || r.status === "logged-in-no-data");
  console.log(`\n证据已写入: ${file}`);
  console.log(`需登录: ${need.length ? need.join(", ") : "无"}`);
  console.log(`已抓到数据: ${bad.length}/${results.length}`);
  console.log(`\n下一步（交给 agent 判断）:`);
  console.log(`  1. 读 ${file}，把各平台余额/到期日/签到状态解析出来`);
  console.log(`  2. 改 ${SKILL}/data/credits.json 的 snapshot 与 grants`);
  console.log(`  3. 用「到期 = 发放 + 固定天数」反推 granted，并与本地 vscdb 时间戳交叉验证`);
  if (need.length) console.log(`  4. ${need.join("/")} 未登录 —— 请用户在浏览器里登录后重跑 --only`);
  await task.finish({ keep: [] });
}

main().catch(e => { console.error("采集失败:", e); process.exit(1); });