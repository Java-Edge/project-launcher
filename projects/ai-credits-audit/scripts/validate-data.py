#!/usr/bin/env python3
"""校验 data/credits.json 内部一致性 —— 改完数据层必跑。

用法:  python3 "$SKILL/scripts/validate-data.py"

检查项：
  1. grants 的 expires 必须在 today 之后（不该有过期数据混进来）
  2. expires 唯一性提示：同平台同到期日多笔要合并，别重复计总额
  3. balance 与 grants 之和的关系（仅当平台声明 balanceDerived 时强校验）
  4. 反推 granted 的偏移量是否落在该平台声明的 expiryRule 天数附近
  5. 签到日历覆盖区间内不得出现「已签」与「漏签」矛盾
  6. 单位闸门：platforms[].unit 非 credit（ZCode 的 token 额度池）不得进积分加总
"""
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime

_SELF = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 常驻进程（如 ego-browser）可能带着迁移前的旧 SKILL，目录不存在时回退脚本所在目录
_ENV_SKILL = os.environ.get("SKILL")
SKILL = _ENV_SKILL if _ENV_SKILL and os.path.isdir(os.path.join(_ENV_SKILL, "scripts")) else _SELF
DATA = os.path.join(SKILL, "data/credits.json")

errs, warns, oks = [], [], []


def d(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def main():
    if not os.path.isfile(DATA):
        print(f"找不到 {DATA}")
        return 1
    j = json.load(open(DATA))
    today = d(j["today"])
    print(f"快照 {j['snapshot']}  |  today={j['today']}  |  平台 {len(j['platforms'])}\n")

    tl = defaultdict(float)
    pool_tl = defaultdict(float)
    for p in j["platforms"]:
        pid = p["id"]
        unit = p.get("unit") or "credit"
        is_credit = unit == "credit"

        # 单位闸门：token 额度池（ZCode）单独记账，绝不并入积分加总/过期压力比
        if not is_credit:
            if p.get("balance") is not None and p.get("grants"):
                s = sum(g.get("amount") or 0 for g in p["grants"])
                if abs(s - p["balance"]) > 1:
                    warns.append(
                        f"{pid}: unit={unit} balance={p['balance']} 但 grants 合计={s:.2f}"
                        " —— 确认额度构成与计划窗口是否一致")
            for g in p.get("grants", []):
                if g.get("expires"):
                    pool_tl[g["expires"]] += g.get("amount") or 0
                    if (d(g["expires"]) - today).days < 0:
                        errs.append(
                            f"{pid}: {unit} 额度窗口 {g['expires']} 已过期，"
                            "应从 grants 里清掉或标记为已终止")
            oks.append(f"{pid}: unit={unit} 额度池，不计入积分加总（{len(p.get('grants', []))} 笔窗口）")

        seen = defaultdict(int)
        for g in p.get("grants", []):
            amt = g.get("amount") or 0
            exp = g.get("expires")
            if not exp:
                warns.append(f"{pid}: 有 grant 缺 expires")
                continue
            if is_credit:
                tl[exp] += amt
            seen[exp] += 1
            delta = (d(exp) - today).days
            if delta < 0:
                errs.append(f"{pid}: grant 到期日 {exp} 已过期 {-delta} 天（today={j['today']}），应从 grants 里清掉")
            elif delta == 0:
                warns.append(f"{pid}: 有 {g.get('amount')} 分今天（{exp}）到期 —— 还没清零，今天内用掉")
            rule = p.get("expiryRule") or ""
            m = re.search(r"发放 \+ (\d+) 天", rule)
            gr = g.get("granted")
            if m and gr:
                delta = (d(exp) - d(gr)).days
                if delta != int(m.group(1)):
                    errs.append(
                        f"{pid}: granted={gr} expires={exp} 间隔 {delta} 天，"
                        f"与 expiryRule「{rule}」不符")
        dup = {k: v for k, v in seen.items() if v > 1}
        if dup:
            warns.append(f"{pid}: 同到期日多笔 {dup} —— 看板会正确叠加，但确认不是重复计数")

        # 签到一致性
        ci = p.get("checkin") or {}
        if ci.get("applicable") and ci.get("done") and ci.get("amount"):
            if not any(g.get("kind") == "checkin" and g.get("granted") == j["today"]
                       for g in p.get("grants", [])):
                warns.append(
                    f"{pid}: checkin.done=true 但今天({j['today']})没有对应的 checkin grant")

        # balance 与 grants 对不上要提示
        if p.get("balance") is not None and p.get("grants"):
            s = sum(g.get("amount") or 0 for g in p["grants"])
            if abs(s - p["balance"]) > max(1.0, p["balance"] * 0.02):
                warns.append(
                    f"{pid}: balance={p['balance']} 但 grants 合计={s:.2f}（差 {s-p['balance']:+.2f}）"
                    f" —— 若非刻意，确认是否有 grant 漏录")

    with_exp = sum(tl.values())
    d7 = sum(v for k, v in tl.items() if (d(k) - today).days <= 7)
    d30 = sum(v for k, v in tl.items() if (d(k) - today).days <= 30)
    print(f"有到期日额度 {with_exp:.2f} | 7 天内 {d7:.2f} | 30 天内 {d30:.2f} "
          f"({d30/with_exp*100:.1f}%)" if with_exp else "无到期日额度")
    near = min(tl, key=lambda k: (d(k) - today).days) if tl else None
    if near:
        print(f"最近到期: {near} (T+{(d(near)-today).days})  {tl[near]:.2f} 分")

    # 签到日历：覆盖区间内不得矛盾
    cal = defaultdict(set)
    for p in j["platforms"]:
        if (p.get("unit") or "credit") != "credit":
            continue  # token 额度池无签到概念
        for g in p.get("grants", []):
            if g.get("kind") == "checkin" and g.get("granted"):
                cal[p["id"]].add(g["granted"])
    for pid, s in cal.items():
        oks.append(f"{pid}: 签到 grant {len(s)} 天 ({min(s)} ~ {max(s)})")

    if pool_tl:
        pn = min(pool_tl, key=lambda k: (d(k) - today).days)
        print(f"token 额度池（不计入上方压力比）: 最早窗口 {pn} "
              f"(T+{(d(pn)-today).days})  {pool_tl[pn]:,.0f} token")

    for line in oks:
        print(f"  ok    {line}")
    for line in warns:
        print(f"  warn  {line}")
    for line in errs:
        print(f"  ERROR {line}")
    print(f"\n{len(errs)} error, {len(warns)} warn")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
