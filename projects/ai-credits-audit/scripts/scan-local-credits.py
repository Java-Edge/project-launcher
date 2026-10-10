#!/usr/bin/env python3
"""本地 AI 工具积分盘点 · 枚举 + 本地缓存扫描

用法:
  scan-local-credits.py --enumerate   全量列出 AI 相关 App / CLI / 数据目录 + BundleID
  scan-local-credits.py --local       扫描 Local Storage / IndexedDB / state.vscdb 找积分与签到证据
  scan-local-credits.py --all         两者都跑

设计前提（实测结论）:
  余额几乎从不落盘。本脚本的价值是拿到「签到痕迹 / 账户 ID / 极少数缓存余额」,
  真实余额必须走浏览器登录态读取。
"""

import argparse
import datetime
import json
import os
import plistlib
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile

HOME = os.path.expanduser("~")
APPS = "/Applications"

# BundleID / 目录名 → 平台。命中即视为 AI 相关，避免漏掉显示名看不出来的应用。
# 已停服、2026-10-02 从本机移除，不再纳入统计：
#   QClaw(com.tencent.qclaw) / clawdbot / clawdis / catpaw-moon
# 故意不写进 AI_HINTS —— 否则下次盘点又会把它们枚举出来。
# AutoClaw / AutoClaw2（智谱）仍在跟踪，勿与 clawdbot 混为一谈。
DECOMMISSIONED = ["QClaw", "com.tencent.qclaw", "clawdbot", "clawdis", "catpaw-moon"]

AI_HINTS = re.compile(
    r"qoder|trae|codebuddy|workbuddy|coze|扣子|autoclaw|openclaw"
    r"|doubao|豆包|bot\.pc|kimicode|kimi|letta|cline|copilot|skilldeck|manus"
    r"|codium|zcode|minimax|raccoon|sensetime|小浣熊|antigravity|cursor|windsurf"
    r"|opencode|meituan|comate|grok|mimo|muse|cherry|chatgpt|claude"
    r"|windsurf|codeium|cagent|icode",
    re.I,
)

CREDIT_KEY = re.compile(
    r"credit|point|quota|balance|coin|bean|checkin|check-in|signin|daily|reward|grant",
    re.I,
)
# 只要「带数值」的积分字段，纯 UI 开关（xxx_click / xxx_banner）不算。
#
# 两个坑：
# 1. Chromium 的 LevelDB 里 key/value 带 protobuf 长度前缀，字段名前**没有**引号，
#    形如 `\x1d\x00\r:\x01pDirect_sub_file_max\x1d;J\x13\x00available_points":11029`。
#    所以前引号必须可选，且要吃掉 \x00-\x20 的二进制前缀。
# 2. 用 Python 正则而非 `grep -oE`——BSD grep 在二进制 + 区间量词下会静默漏匹配。
CREDIT_FIELD = re.compile(
    r"[\x00-\x20]*"
    r'([a-zA-Z_]{0,24}(?:credit|point|quota|balance|coin|bean)[a-zA-Z_]{0,24})'
    r'["\x00-\x20]*:\s*["\x00-\x20]*(-?[0-9]+(?:\.[0-9]+)?)',
    re.I,
)
# 排除同名误命中：Java 类名（BeanFactoryB）、版本号、以及值为 0 的空配置
CREDIT_FALSE = re.compile(r"Factory|Handler|Manager|Provider|Version|Impl$|^[A-Z]")
# vscdb 里关心的 key（签到证据主要来源）
VSCDB_KEY = re.compile(
    r"credit|point|quota|checkin|check-in|signin|balance|grant|dailyCheck", re.I
)
TS_FIELD = re.compile(r'"(lastWriteAt|firstWriteAt|lastWriteDay)":"?(\d{10,13})"?')

SUPPORT = os.path.join(HOME, "Library/Application Support")
BIN_DIRS = [
    os.path.join(HOME, ".local/bin"),
    os.path.join(HOME, "go/bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    os.path.join(HOME, ".bun/bin"),
]


# ────────────────────────────── 枚举 ──────────────────────────────

def bundle_id(app_path):
    try:
        with open(os.path.join(app_path, "Contents/Info.plist"), "rb") as f:
            return plistlib.load(f).get("CFBundleIdentifier", "-")
    except Exception:
        return "-"


def dir_size(path):
    try:
        out = subprocess.run(
            ["du", "-sh", path], capture_output=True, text=True, timeout=25
        )
        return out.stdout.split("\t")[0]
    except Exception:
        return "?"


def cmd_enumerate():
    rows = []
    if os.path.isdir(APPS):
        for name in sorted(os.listdir(APPS)):
            if not name.endswith(".app"):
                continue
            bid = bundle_id(os.path.join(APPS, name))
            hay = f"{name} {bid}"
            if not (AI_HINTS.search(hay) or AI_HINTS.search(name)):
                continue
            rows.append(("App", name.replace(".app", ""), bid, ""))

    # Application Support 里的真实数据目录（很多 App 显示名不含关键词）
    if os.path.isdir(SUPPORT):
        for name in sorted(os.listdir(SUPPORT)):
            if not AI_HINTS.search(name):
                continue
            p = os.path.join(SUPPORT, name)
            if not os.path.isdir(p):
                continue
            rows.append(("Data", name, "-", dir_size(p)))

    # CLI
    seen = set()
    for d in BIN_DIRS:
        if not os.path.isdir(d):
            continue
        try:
            for f in sorted(os.listdir(d)):
                if not AI_HINTS.search(f) or f in seen:
                    continue
                seen.add(f)
                rows.append(("CLI", f, "-", d))
        except OSError:
            pass

    w = max((len(r[1]) for r in rows), default=10)
    print(f"{'类型':<6} {'名称':<{w}}  {'BundleID / 路径':<44} 大小")
    print("─" * (w + 70))
    for kind, name, bid, size in rows:
        print(f"{kind:<6} {name:<{w}}  {bid:<44} {size}")
    print(f"\n合计 {len(rows)} 项。全量 App 共 "
          f"{len([x for x in os.listdir(APPS) if x.endswith('.app')])} 个 —— "
          f"不要用关键词过滤 App 列表，会漏。")
    return rows


# ────────────────────────────── 本地扫描 ──────────────────────────────

def _iter_matches(root, sub, pattern, max_bytes=400 * 1024 * 1024):
    """纯 Python 扫描目录内文件做正则匹配。

    不用 `grep -oE`：macOS 自带 BSD grep 的 -o 配合区间量词/二进制文件行为不可靠，
    实测会静默漏掉明明存在的字段。
    """
    d = os.path.join(root, sub)
    if not os.path.isdir(d):
        return
    budget = max_bytes
    for dirpath, _dirs, files in os.walk(d):
        for fn in files:
            fp = os.path.join(dirpath, fn)
            try:
                if os.path.getsize(fp) > 64 * 1024 * 1024:
                    continue
                with open(fp, "rb") as f:
                    data = f.read()
            except OSError:
                continue
            budget -= len(data)
            if budget <= 0:
                return
            for m in pattern.finditer(data.decode("utf-8", "ignore")):
                yield m


def scan_credit_fields(root):
    """在 Local Storage / IndexedDB 里找带数值的积分字段。"""
    hits = {}
    for sub in ("Local Storage", "IndexedDB"):
        for m in _iter_matches(root, sub, CREDIT_FIELD):
            key, val = m.group(1), m.group(2)
            if float(val) <= 0 or CREDIT_FALSE.search(key):
                continue
            hits.setdefault(key, set()).add(val)
    return hits


def scan_vscdb(root):
    """dump state.vscdb 里含 credit/checkin 等关键词的 key+value，并解析时间戳。"""
    p = os.path.join(root, "User/globalStorage/state.vscdb")
    if not os.path.isfile(p):
        return []
    tmp = os.path.join(tempfile.gettempdir(), "_audit_vscdb.db")
    try:
        shutil.copy(p, tmp)
        conn = sqlite3.connect(tmp)
        rows = conn.execute("select key, value from ItemTable").fetchall()
        conn.close()
    except sqlite3.DatabaseError as e:
        return [{"error": f"vscdb malformed: {e}"}]

    out = []
    for k, v in rows:
        if not VSCDB_KEY.search(k or ""):
            continue
        rec = {"key": k, "value": (v or "")[:400]}
        for f, ts in TS_FIELD.findall(v or ""):
            if f.endswith("Day"):
                rec[f] = ts
            else:
                ms = int(ts)
                sec = ms / 1000 if ms > 1e11 else ms
                try:
                    rec[f] = datetime.datetime.fromtimestamp(sec).strftime("%Y-%m-%d %H:%M")
                except Exception:
                    rec[f] = str(ms)
        out.append(rec)
    return out


def cmd_local():
    targets = []
    if os.path.isdir(SUPPORT):
        for name in sorted(os.listdir(SUPPORT)):
            p = os.path.join(SUPPORT, name)
            if os.path.isdir(p) and (
                AI_HINTS.search(name)
                or os.path.isdir(os.path.join(p, "Local Storage"))
                or os.path.isfile(os.path.join(p, "User/globalStorage/state.vscdb"))
            ):
                targets.append(name)

    balance_found, signin_found = [], []
    for name in targets:
        root = os.path.join(SUPPORT, name)
        fields = scan_credit_fields(root)
        if fields:
            balance_found.append((name, fields))
        for rec in scan_vscdb(root):
            signin_found.append((name, rec))

    print("=" * 74)
    print("A. 缓存中带数值的积分字段（真实余额极少命中，参考价值有限）")
    print("=" * 74)
    if not balance_found:
        print("  无命中 —— 印证「余额不落盘」，必须走浏览器登录态。")
    for name, fields in balance_found:
        print(f"\n  [{name}]")
        for k, vals in sorted(fields.items()):
            print(f"    {k} = {', '.join(sorted(vals))}")

    print("\n" + "=" * 74)
    print("B. 签到 / 额度痕迹（vscdb，主要用于反推签到历史与偏移量）")
    print("=" * 74)
    if not signin_found:
        print("  无命中")
    for name, rec in signin_found:
        if "error" in rec:
            print(f"  [{name}] {rec['error']}")
            continue
        meta = "  ".join(
            f"{f}={rec[f]}" for f in ("lastWriteDay", "lastWriteAt", "firstWriteAt") if f in rec
        )
        print(f"\n  [{name}] {rec['key'][:110]}")
        if meta:
            print(f"      {meta}")
        print(f"      {rec['value'][:180]}")

    print("\n" + "=" * 74)
    print("下一步：真实余额走 ego-browser 打开各平台登录态页面读取。")
    print("余额页路径与过期规则见 skill 目录下的 references/platforms.md")
    print("=" * 74)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--enumerate", action="store_true", help="全量枚举 AI 相关 App/CLI")
    ap.add_argument("--local", action="store_true", help="扫描本地缓存找积分与签到证据")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    if a.all or (not a.enumerate and not a.local):
        cmd_enumerate()
        print("\n\n")
        cmd_local()
        return
    if a.enumerate:
        cmd_enumerate()
    if a.local:
        cmd_local()


if __name__ == "__main__":
    main()