#!/usr/bin/env python3
"""
add_service.py —— 把一个新的本地服务注册进 project-launcher 管控台。

架构现状（2026-10 复核过，别再照旧流程改文件）：
  - `config/services.json` 是服务的**单一事实源**（server.py 第 6 行写明）；
  - 面板 `server.py` 里的 ConfigStore 会按 mtime **热加载**，改完刷新页面即生效，**不需要重启面板**；
  - `scripts/start-all.sh` / `stop-all.sh` / `status.sh` 通过 `scripts/utils/service-control.sh`
    的 `svc_query` 读同一份 JSON，**不需要手改这三个脚本**，也不需要新建 `scripts/start-<id>.sh`
    （通用入口是 `scripts/start-service.sh <id>`）。
  所以「加一个服务」= 只在 services.json 里加一个对象。旧版脚本改 server.py 的 SERVICES 字典
  和三个 shell 的做法已经作废（server.py 里根本没有 SERVICES 字典了）。

写法：所有改动都是**文本级插入/删除**，除新增/删除的那几行外文件字节不变，
保住这份配置手工排的版（groups 一行一个、service 的 start/stop 内联成一行）。
写入前先备份到 `logs/services.json.bak.<时间戳>`，写完用 `json.loads` 复验并确认 id 在位。

用法：
  python3 scripts/add_service.py --config /tmp/service.json          # 正式写入
  python3 scripts/add_service.py --config /tmp/service.json --dry-run # 只打印计划，不落盘
  python3 scripts/add_service.py --config /tmp/service.json --autostart  # 同时加进 autostart_order
  python3 scripts/add_service.py --example > /tmp/service.json        # 先拿模板再填
  python3 scripts/add_service.py --list                               # 看分组/类型/现有服务
  python3 scripts/add_service.py --check <id>                         # 校验 shell 侧 + 面板侧都读到了
  python3 scripts/add_service.py --remove <id> --yes                  # 回滚
  全局：--project-root PATH（默认脚本自定位到仓库根，测试时用这个指别处）
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

PANEL_PORT = 8090
REQUIRED_KEYS = ("id", "name", "type", "group")
ALLOWED_KEYS = {
    "id", "name", "type", "group", "port", "url", "log_file",
    "status_cmd", "start", "stop", "self", "terminal_script",
}
# 与 config/services.json 里既有条目保持一致的键顺序
KEY_ORDER = [
    "id", "name", "type", "group", "port", "url", "log_file",
    "status_cmd", "start", "stop", "self", "terminal_script",
]


def die(msg, code=2):
    print(f"❌ {msg}", file=sys.stderr)
    sys.exit(code)


def find_root(script_file):
    """从脚本位置向上找到第一个含 config/services.json 的目录 = 仓库根。
    本 skill 装在 skills/add-service/scripts/ 下（相对根 3 层），但别把层数写死：
    挪目录、或将来放到别的位置，靠配置文件认根比靠 parents[N] 靠谱。"""
    here = Path(script_file).resolve()
    for cand in here.parents:
        if (cand / "config" / "services.json").exists():
            return cand
    die(f"从 {here} 往上没找到 config/services.json；用 --project-root 指明仓库根")


def cfg_path(root):
    return root / "config" / "services.json"


def load_cfg(root):
    p = cfg_path(root)
    if not p.exists():
        die(f"找不到配置文件：{p}")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        die(f"{p} 不是合法 JSON（先修好再来说）：{e}")


# ---------------------------------------------------------------- JSON 文本级元素定位
def array_elements(text, open_idx):
    """给定数组左括号下标，返回该数组顶层元素的 (start, end) 下标表。"""
    els, i, n = [], open_idx + 1, len(text)
    while i < n:
        c = text[i]
        if c in " \t\r\n,":
            i += 1
            continue
        if c == "]":
            break
        start = i
        if c == '"':                                  # 字符串元素：扫到未转义的闭合引号
            i += 1
            esc = False
            while i < n:
                ch = text[i]
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    i += 1
                    break
                i += 1
            else:
                die("JSON 字符串没闭合，定位不到数组元素")
        elif c == "{" or c == "[":
            depth = 0
            in_str = False
            esc = False
            while i < n:
                ch = text[i]
                if in_str:
                    if esc:
                        esc = False
                    elif ch == "\\":
                        esc = True
                    elif ch == '"':
                        in_str = False
                else:
                    if ch == '"':
                        in_str = True
                    elif ch in "{[":
                        depth += 1
                    elif ch in "}]":
                        depth -= 1
                        if depth == 0:
                            i += 1
                            break
                i += 1
            else:
                die("JSON 结构没闭合，定位不到数组元素")
        else:  # 裸字面量：null/true/number
            while i < n and text[i] not in ",\n]":
                i += 1
            i = i  # end 落在分隔符前
        els.append((start, i))
        continue
    return els


def find_array_open(text, key):
    m = re.search(r'"%s"\s*:\s*\[' % re.escape(key), text)
    if not m:
        die(f"配置里找不到数组字段 \"{key}\"")
    return text.index("[", m.start())


def element_lines(text, idx):
    """返回 (该元素所在行的缩进, 行首下标)"""
    line_start = text.rfind("\n", 0, idx) + 1
    seg = text[line_start:idx]
    return (seg if seg.strip() == "" else ""), line_start


# ---------------------------------------------------------------- 渲染一条服务
def j(v):
    return json.dumps(v, ensure_ascii=False)


def render_service(svc, indent="    "):
    ik = indent + "  "
    lines = [indent + "{"]
    keys = [k for k in KEY_ORDER if k in svc] + sorted(set(svc) - set(KEY_ORDER))
    body = []
    for k in keys:
        v = svc[k]
        if k in ("start", "stop") and isinstance(v, dict):
            inner = ", ".join(f'{j(kk)}: {j(vv)}' for kk, vv in v.items())
            body.append(f'{ik}{j(k)}: {{{inner}}}')
        else:
            body.append(f'{ik}{j(k)}: {j(v)}')
    lines.append(",\n".join(body))
    lines.append(indent + "}")
    return "\n".join(lines)


# ---------------------------------------------------------------- 校验与补全
def normalize(svc, cfg, root, allow_port_dup=False):
    if not isinstance(svc, dict):
        die("--config 指向的文件得是一个 JSON 对象（一条服务），不是数组")
    unknown = sorted(set(svc) - ALLOWED_KEYS)
    if unknown:
        die(f"字段不认识：{unknown}；可用字段：{sorted(ALLOWED_KEYS)}")
    missing = [k for k in REQUIRED_KEYS if not svc.get(k)]
    if missing:
        die(f"必填字段缺失：{missing}")

    sid = svc["id"]
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", sid):
        die(f"id 得是 kebab-case（小写字母/数字/-/.）：{sid!r}")

    groups = [g["id"] for g in cfg.get("groups", [])]
    types = list(cfg.get("type_labels", {}))
    if svc["group"] not in groups:
        die(f"分组 {svc['group']!r} 不存在；现有分组：{groups}")
    if svc["type"] not in types:
        die(f"类型 {svc['type']!r} 不存在；现有类型：{types}")

    services = cfg.get("services", [])
    dup = [s["id"] for s in services if s["id"] == sid]
    if dup:
        die(f"服务 id 已存在：{sid}（要改它就直接编辑 config/services.json，或先 --remove {sid}）")

    port = svc.get("port")
    if port is not None:
        if not isinstance(port, int) or not (1024 <= port <= 65535):
            die(f"port 得是 1024-65535 的整数：{port!r}")
        taken = [s["id"] for s in services if s.get("port") == port]
        if taken and not allow_port_dup:
            die(f"端口 {port} 已被 {taken} 占用（确实要共用就加 --allow-port-dup）")

    # svc_query 的 status/start 行都会取 status_cmd，缺了就 KeyError —— 必须保证有
    if not svc.get("status_cmd"):
        if port:
            svc["status_cmd"] = f"lsof -i :{port} -sTCP:LISTEN"
            print(f"ℹ️  没给 status_cmd，按端口自动生成：{svc['status_cmd']}")
        else:
            die("无端口服务必须自己给 status_cmd（面板和 status.sh 都靠它判定运行与否）")

    start = svc.get("start")
    if start is not None:
        if not isinstance(start, dict) or not start.get("cmd"):
            die(f"start 需要 {{\"dir\": ..., \"cmd\": ...}}，cmd 必填：{start!r}")
        d = start.get("dir") or "{project_root}"
        if d.startswith("/") is False and d != "{project_root}":
            start["dir"] = "{project_root}/" + d.lstrip("./")
        svc["start"] = {"dir": start["dir"], "cmd": start["cmd"]}

    stop = svc.get("stop")
    if stop is not None:
        # shell 侧 svc_stop_one 认 port/pattern/cmd 三种；面板 stop_service 只显式处理 cmd/pattern，
        # mode=port 会落到「按顶层 port 杀端口」那条兜底路径（server.py:222-223）
        if not isinstance(stop, dict) or stop.get("mode") not in ("cmd", "pattern", "port") or not stop.get("value"):
            die(f'stop 需要 {{"mode": "cmd"|"pattern"|"port", "value": ...}}：{stop!r}')
        if stop["mode"] == "port":
            if not str(stop["value"]).isdigit():
                die(f'stop.mode=port 时 value 得是端口号：{stop!r}')
            if port and int(stop["value"]) != port:
                die(f'stop.value={stop["value"]} 与顶层 port={port} 不一致，面板侧按顶层端口杀会停错')
            if not port:
                die('stop.mode=port 还必须给顶层 port —— 面板只按顶层端口停，shell 才按 value 停')
    elif not port:
        print(f"⚠️  {sid} 既没有 stop 也没有 port，面板上「停止」按钮会报「没有配置停止方式」")

    if port and not svc.get("url"):
        print(f"ℹ️  有端口但没给 url，卡片上不会有「访问」链接（建议 url: http://127.0.0.1:{port}）")
    if not svc.get("log_file"):
        svc["log_file"] = f"{sid}.log"
    svc.setdefault("url", None)
    return svc


# ---------------------------------------------------------------- 写盘
def atomic_write(path, text, root):
    backup_dir = root / "logs"
    backup_dir.mkdir(exist_ok=True)
    bak = backup_dir / f"services.json.bak.{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(path, bak)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(text, encoding="utf-8")
    try:
        json.loads(tmp.read_text(encoding="utf-8"))     # 复验才敢替换
    except json.JSONDecodeError as e:
        tmp.unlink(missing_ok=True)
        die(f"生成的 JSON 非法，已放弃写入（原文件未动，备份 {bak}）：{e}")
    tmp.replace(path)
    return bak


def insert_service(text, svc_json, group, indent_hint=None):
    open_idx = find_array_open(text, "services")
    els = array_elements(text, open_idx)
    entry = render_service(svc_json, indent=indent_hint or "    ")
    if not els:
        return text[:open_idx + 1] + "\n" + entry + "\n" + text[open_idx + 1:]
    # 插到同分组最后一条之后，保持分组在文件里成块
    target = None
    for st, en in els:
        try:
            s = json.loads(text[st:en])
        except json.JSONDecodeError:
            continue
        if s.get("group") == group:
            target = en
    if target is None:
        target = els[-1][1]
        print(f"ℹ️  分组 {group} 在文件里没有同类条目，追加到 services 末尾")
    indent, _ = element_lines(text, els[0][0])
    entry = render_service(svc_json, indent=indent or "    ")
    return text[:target] + ",\n" + entry + text[target:]


def insert_autostart(text, sid):
    open_idx = find_array_open(text, "autostart_order")
    els = array_elements(text, open_idx)
    if not els:
        return text[:open_idx + 1] + f'\n    {j(sid)}\n  ' + text[open_idx + 1:]
    end = els[-1][1]
    return text[:end] + f",\n    {j(sid)}" + text[end:]


def delete_element(text, st, en):
    """删掉 [st,en) 这个数组元素，并连带它独占的那几行（含行尾换行），保证整份文件零残留。"""
    line_start = text.rfind("\n", 0, st) + 1
    nl_here = text.find("\n", en)
    line_end = nl_here if nl_here != -1 else len(text)
    # 「同一行还有兄弟」要看两头：前面有值（如 autostart_order 行首 id 之后还有好几个），
    # 或后面除了逗号/闭括号还有别的值。只看行首缩进会把行首 id 误判成独占整行。
    has_prev = text[line_start:st].strip() != ""
    has_next_on_line = re.sub(r"[\s,\]\}]+$", "", text[en:line_end]) != ""
    mid_line = has_prev or has_next_on_line
    i = en
    while i < len(text) and text[i] in " \t":
        i += 1
    has_next_comma = i < len(text) and text[i] == ","
    nl_after = (text.index("\n", en) + 1) if "\n" in text[en:] else len(text)
    if mid_line:                            # 只抠掉这段值（连它自己那个逗号），整行留着
        if has_next_comma:
            return text[:st] + text[i + 1:]
        pre = text.rfind(",", 0, st)        # 行内末位：吃前面那个逗号
        if pre == -1:
            die("数组只剩一个元素了，这种边界请手工编辑")
        return text[:pre] + text[en:]
    if has_next_comma:                      # 后面还有兄弟元素：删「本元素独占的整行 + 尾随逗号 + 换行」
        return text[:line_start] + text[(text.index("\n", i) + 1) if "\n" in text[i:] else len(text):]
    pre = text.rfind(",", 0, line_start)    # 末位元素：把前面那个逗号一起吃掉
    if pre == -1:
        die("数组只剩一个元素了，这种边界请手工编辑")
    # 保留前一行末尾那个换行，否则末位元素删完会把上一行和 `  ]` 黏成一行
    keep_nl = "\n" if nl_after and text[nl_after - 1] == "\n" else ""
    return text[:pre] + keep_nl + text[nl_after:]


def remove_service(text, sid, root):
    open_idx = find_array_open(text, "services")
    els = array_elements(text, open_idx)
    hit = None
    for st, en in els:
        try:
            if json.loads(text[st:en]).get("id") == sid:
                hit = (st, en)
                break
        except json.JSONDecodeError:
            continue
    if not hit:
        die(f"services 里没有 id={sid}，没动任何文件")
    if len(els) < 2:
        die("services 里只剩这一条服务，删空数组这种边界我没写，请手工编辑")
    new = delete_element(text, hit[0], hit[1])
    # 顺带从 autostart_order 摘掉
    try:
        ao = find_array_open(new, "autostart_order")
        for s2, e2 in array_elements(new, ao):
            try:
                if json.loads(new[s2:e2]) != sid:
                    continue
            except json.JSONDecodeError:
                continue
            new = delete_element(new, s2, e2)
            break
    except SystemExit:
        pass
    return new


# ---------------------------------------------------------------- 校验读取侧
def check(root, sid):
    ok = True
    sh = subprocess.run(
        ["bash", "-c",
         f'cd {j(str(root))} && source scripts/utils/service-control.sh '
         f'&& svc_query status | awk -F"\\t" -v id={j(sid)} \'$1==id{{print; f=1}} END{{exit f?0:3}}\''],
        capture_output=True, text=True)
    if sh.returncode == 0:
        print("✅ shell 侧 svc_query status 读到了：", sh.stdout.strip())
    else:
        ok = False
        print("❌ shell 侧没读到（status.sh / stop-all.sh 也会看不到它）：",
              (sh.stderr or sh.stdout).strip()[:200])
    try:
        panel = subprocess.run(["curl", "-s", "-m", "6", f"http://localhost:{PANEL_PORT}/status"],
                               capture_output=True, text=True)
        data = json.loads(panel.stdout or "{}")
        if sid in data:
            print(f"✅ 面板 /status 已热加载到：{json.dumps(data[sid], ensure_ascii=False)[:160]}")
        else:
            ok = False
            print(f"❌ 面板 /status 里没有 {sid}（面板在跑但没读到，检查 config 是否被别处覆盖）")
    except Exception as e:
        print(f"⚠️  面板侧没校验成（{PANEL_PORT} 端口没起或 curl 失败）：{e.__class__.__name__} —— 手动刷新 http://localhost:{PANEL_PORT}/")
    return ok


# ---------------------------------------------------------------- 入口
EXAMPLE = {
    "id": "aktools",
    "name": "📊 AKTools 数据服务",
    "type": "backend",
    "group": "infra",
    "port": 8000,
    "url": "http://127.0.0.1:8000",
    "log_file": "aktools.log",
    "status_cmd": "lsof -i :8000 -sTCP:LISTEN",
    "start": {"dir": "/Users/javaedge/soft/PyCharmProjects/akshare", "cmd": "uvicorn aktools.main:app --host 127.0.0.1 --port 8000"},
    "stop": {"mode": "pattern", "value": "uvicorn aktools.main:app"},
}

TEMPLATE = {
    "id": "my-service",
    "name": "🧩 我的服务（显示名带 emoji）",
    "type": "tool",
    "group": "tools",
    "port": 8123,
    "url": "http://127.0.0.1:8123",
    "status_cmd": "lsof -i :8123 -sTCP:LISTEN",
    "start": {"dir": "{project_root}", "cmd": "python3 -m http.server 8123 --bind 127.0.0.1"},
    "stop": {"mode": "pattern", "value": "http.server 8123"},
}


def main():
    ap = argparse.ArgumentParser(description="把服务加进 project-launcher 的 config/services.json")
    ap.add_argument("--config", help="一条服务的 JSON 对象文件")
    ap.add_argument("--dry-run", action="store_true", help="只打印计划，不落盘")
    ap.add_argument("--autostart", action="store_true", help="同时加进 autostart_order（一键 start-all 才会带上）")
    ap.add_argument("--allow-port-dup", action="store_true", help="允许与别的服务共用端口")
    ap.add_argument("--remove", metavar="ID", help="按 id 删掉一条服务")
    ap.add_argument("--check", metavar="ID", help="校验 shell 侧与面板侧都能读到该 id")
    ap.add_argument("--list", action="store_true", help="列出现有分组/类型/服务")
    ap.add_argument("--example", action="store_true", help="打印一个真实条目例子")
    ap.add_argument("--template", action="store_true", help="打印一份待填模板")
    ap.add_argument("--yes", action="store_true", help="删除时不再二次确认")
    ap.add_argument("--project-root", default=None, help="仓库根（默认由脚本位置自定位）")
    a = ap.parse_args()

    root = Path(a.project_root).resolve() if a.project_root else find_root(__file__)
    if a.example:
        print(json.dumps(EXAMPLE, ensure_ascii=False, indent=2)); return 0
    if a.template:
        print(json.dumps(TEMPLATE, ensure_ascii=False, indent=2)); return 0

    cfg = load_cfg(root)
    if a.list:
        print("分组:", [g["id"] for g in cfg.get("groups", [])])
        print("类型:", list(cfg.get("type_labels", {})))
        print("服务:")
        for s in cfg.get("services", []):
            print(f"  {s['id']:<26} {s.get('group','?'):<16} {str(s.get('port') or '-'):<6} {s['name']}")
        return 0

    p = cfg_path(root)
    text = p.read_text(encoding="utf-8")

    if a.check:
        return 0 if check(root, a.check) else 1

    if a.remove:
        if not a.yes:
            print(f"⚠️  将从 {p} 删除服务 {a.remove!r}（加 --yes 免确认）", file=sys.stderr)
            return 3
        new = remove_service(text, a.remove, root)
        bak = atomic_write(p, new, root)
        after = load_cfg(root)
        if any(s["id"] == a.remove for s in after.get("services", [])):
            die("删完还在？！文件可能被别处覆盖了")
        print(f"✅ 已删除 {a.remove}（备份 {bak}）")
        print(f"   剩 {len(after.get('services', []))} 条服务；刷新 http://localhost:{PANEL_PORT}/ 即可")
        return 0

    if not a.config:
        ap.print_help()
        return 2

    svc = json.loads(Path(a.config).read_text(encoding="utf-8"))
    svc = normalize(svc, cfg, root, allow_port_dup=a.allow_port_dup)
    entry = render_service(svc)
    print("将要写入的一条服务：")
    print(entry)
    if a.dry_run:
        print("\n--dry-run：没动文件")
        return 0

    new = insert_service(text, svc, svc["group"])
    if a.autostart:
        new = insert_autostart(new, svc["id"])
    bak = atomic_write(p, new, root)

    after = load_cfg(root)
    got = next((s for s in after.get("services", []) if s["id"] == svc["id"]), None)
    if not got:
        die(f"写完读不到 {svc['id']}，备份在 {bak}")
    print(f"✅ 已写入 {cfg_path(root)}（备份 {bak}）")
    print(f"   共 {len(after.get('services', []))} 条服务，autostart_order 里{'已' if a.autostart else '未'}加入该 id")
    print(f"   面板会热加载：刷新 http://localhost:{PANEL_PORT}/ 就能看到；不用重启 server.py")
    print(f"   单启：./scripts/start-service.sh {svc['id']}   ·   回滚：python3 {Path(__file__).name} --remove {svc['id']} --yes")
    if a.project_root:      # 指定了别的根（测试用），shell 侧/面板侧校验没有意义
        print("ℹ️  用了 --project-root，跳过 svc_query 与面板校验"); return 0
    # 注意别 return 布尔值：sys.exit(True) 的退出码是 1，成功反倒报失败
    return 0 if check(root, svc["id"]) else 1


if __name__ == "__main__":
    sys.exit(main())
