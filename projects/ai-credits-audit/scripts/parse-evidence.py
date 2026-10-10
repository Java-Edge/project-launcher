#!/usr/bin/env python3
"""把 data/raw/collect-*.json 的页面文本解析成结构化数据，回写 data/credits.json。

为什么要有这层：Trae / Qoder / 扣子 三家的 DOM 文本格式高度规整，
可以确定性正则解析，不需要 agent 每次手工判断。这样页面的「立即刷新」
才能真正做到端到端更新数字。

只解析格式稳定的平台；其余（Manus / 豆包 / CodeBuddy / 商汤 / MiniMax）
本来就没有稳定的积分结构，脚本如实标 pending，交给 agent。

用法:
  python3 "$SKILL/scripts/parse-evidence.py"                    # 用最新一份证据
  python3 "$SKILL/scripts/parse-evidence.py" <evidence.json>
"""
import glob
import json
import os
import re
import sys
from datetime import date, datetime, timedelta

_SELF = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 常驻进程（如 ego-browser）可能带着迁移前的旧 SKILL，目录不存在时回退脚本所在目录
_ENV_SKILL = os.environ.get("SKILL")
SKILL = _ENV_SKILL if _ENV_SKILL and os.path.isdir(os.path.join(_ENV_SKILL, "scripts")) else _SELF
DATA = os.path.join(SKILL, "data/credits.json")
RAW = os.path.join(SKILL, "data/raw")

num = lambda s: float(s.replace(",", ""))


def dstr(d):
    return d.isoformat()


# ───────── 解析器：每个平台一个，返回 (grants, balance, checkin, notes) ─────────

def parse_trae(text, today):
    g = []
    # 签到奖励\n2026/10/02 22:21 到期\n200 / 200
    for m in re.finditer(
        r"签到奖励\s*\n?\s*(\d{4})/(\d{2})/(\d{2})[^\n]*到期\s*\n?\s*([\d,]+)\s*/\s*([\d,]+)",
        text,
    ):
        y, mo, da, rest, tot = m.groups()
        exp = date(int(y), int(mo), int(da))
        g.append({
            "granted": dstr(exp - timedelta(days=31)),   # 到期 = 发放 + 31 天
            "expires": dstr(exp),
            "amount": num(rest),
            "kind": "checkin",
        })
    # 其它一次性奖励（TraeWork 桌面端 / 每月登录赠送）
    for label, kind in [("下载 TraeWork 桌面端奖励", "task-reward"),
                        ("每月登录赠送", "monthly")]:
        m = re.search(
            label + r"[^\n]*\n[^\n]*?\n?[^\n]*?(\d{4})/(\d{2})/(\d{2})[^\n]*到期\s*\n?\s*([\d,]+)\s*/\s*([\d,]+)",
            text)
        if not m:
            m = re.search(label + r".{0,120}?(\d{4})/(\d{2})/(\d{2})[^\n]*到期\s*\n?\s*([\d,]+)\s*/\s*([\d,]+)",
                          text, re.S)
        if m:
            y, mo, da, rest, tot = m.groups()
            g.append({"granted": None, "expires": dstr(date(int(y), int(mo), int(da))),
                      "amount": num(rest), "kind": kind, "label": label})

    bal = None
    m = re.search(r"总可用积分\s*\n?\s*([\d,]+\.?\d*)", text)
    if m:
        bal = num(m.group(1))

    ci = {"applicable": True}
    today_grants = [x for x in g if x["kind"] == "checkin" and x["granted"] == dstr(today)]
    ci["done"] = bool(today_grants)
    ci["amount"] = today_grants[0]["amount"] if today_grants else 0

    notes = []
    m = re.search(r"共\s*(\d+)\s*笔", text)
    if m:
        notes.append(f"签到共 {m.group(1)} 笔")
    n_chk = len([x for x in g if x["kind"] == "checkin"])
    notes.append(f"解析到 {n_chk} 笔签到 grant")
    return g, bal, ci, notes


def parse_qoder(text, today):
    g = []
    for m in re.finditer(
        r"获赠资源包\s*\(总计:\s*([\d,.]+)\)\s*\n?\s*剩余\s*([\d,.]+)\s*credits。有效期至\s*(\d{4})年(\d{1,2})月(\d{1,2})日",
        text,
    ):
        total, rest, y, mo, da = m.groups()
        exp = date(int(y), int(mo), int(da))
        g.append({"granted": dstr(exp - timedelta(days=30)),   # 到期 = 发放 + 30 天
                  "expires": dstr(exp), "amount": num(rest), "kind": "checkin"})

    bal = None
    m = re.search(r"个人资源包[\s\S]{0,200}?剩余\s*([\d,]+)", text)
    if m:
        bal = num(m.group(1))

    # 今天是否已签：按 30 天偏移反推，看有没有 granted == today 的包
    today_g = [x for x in g if x["granted"] == dstr(today)]
    latest = max((x["granted"] for x in g if x["granted"]), default=None)

    ci = {"applicable": True, "done": bool(today_g),
          "amount": today_g[0]["amount"] if today_g else 0}
    notes = [f"解析到 {len(g)} 个资源包"]
    if latest:
        notes.append(f"最新发放日 {latest}" + ("（= 今天，已签）" if latest == dstr(today)
                                              else f"，今天 {dstr(today)} 尚无新包 → 未签"))
    return g, bal, ci, notes


def parse_coze(text, today):
    bal = None
    m = re.search(r"总积分[：:]\s*([\d,.]+)", text)
    if m:
        bal = num(m.group(1))
    return [], bal, {"applicable": False}, ["扣子无每日签到"]


def parse_minimax(text, today):
    ci = {"applicable": True, "done": False, "amount": 800}
    notes = []
    if re.search(r"每日签到", text):
        # 签到面板首格有勾 => 已签；纯文本抓不到勾，需要 agent/截图确认
        ci["done"] = None      # None = 不确定，别瞎猜
        notes.append("签到浮层存在但文本无法判断是否已签（首格是图标），需视觉确认")
    else:
        ci["applicable"] = False
    return [], None, ci, notes


PARSERS = {"trae-cn": parse_trae, "qoder": parse_qoder,
           "coze": parse_coze, "minimax": parse_minimax}


def main():
    ev = sys.argv[1] if len(sys.argv) > 1 else \
        (sorted(glob.glob(os.path.join(RAW, "collect-*.json")), key=os.path.getmtime) or [None])[-1]
    if not ev or not os.path.isfile(ev):
        print("没有可用证据文件，请先跑 collect-credits.js")
        return 1

    db = json.load(open(DATA))
    today = date.fromisoformat(db["today"])
    if today != date.today():
        print(f"[warn] JSON 的 today={db['today']}，实际系统日期={date.today()}，按 JSON 为准")
    byid = {r["id"]: r for r in json.load(open(ev))["results"]}

    changed = []
    for p in db["platforms"]:
        pid = p["id"]
        if pid not in PARSERS or pid not in byid:
            continue
        rec = byid[pid]
        if rec.get("status") == "need-login":
            print(f"  skip  {pid}: 未登录")
            continue
        text = rec.get("fullText", "")
        if not text:
            continue
        try:
            grants, bal, ci, notes = PARSERS[pid](text, today)
        except Exception as e:
            print(f"  ERROR {pid}: {e}")
            continue

        if grants:
            p["grants"] = grants
        if bal is not None:
            p["balance"] = bal
        if ci.get("applicable"):
            p["checkin"] = {**p.get("checkin", {}), **ci}
        elif ci.get("applicable") is False:
            # 页面这次没渲染出签到入口 —— 必须清掉上次的 done，否则残留旧值会被
            # validate-data.py 误报成「done=true 但今天没有 grant」
            p["checkin"] = {"applicable": False,
                            "evidence": f"自动采集于 {os.path.basename(ev)}：页面未出现签到入口，状态未知"}
            if ci.get("evidence"):
                p["checkin"]["evidence"] = "自动解析自 " + os.path.basename(ev)
            else:
                p["checkin"]["evidence"] = "自动解析自 " + os.path.basename(ev)
        p["source"] = f"自动采集 {os.path.basename(ev)}"
        p["confidence"] = "confirmed"
        changed.append((pid, bal, notes))
        print(f"  ok    {pid}  balance={bal}  " + " | ".join(notes))

    db["snapshot"] = datetime.now().astimezone().isoformat(timespec="seconds")
    db["today"] = dstr(date.today())
    json.dump(db, open(DATA, "w"), ensure_ascii=False, indent=2)
    print(f"\n已更新 {DATA}")
    print(f"snapshot -> {db['snapshot']}  today -> {db['today']}")
    if not changed:
        print("没有任何平台被更新（可能都未登录或格式变了，需 agent 介入）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
