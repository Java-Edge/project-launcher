---
name: add-service
description: 把本地服务注册进 project-launcher 管控台（http://localhost:8090/），或从管控台下线一个服务。用户提供服务显示名、英文 id、端口、启动命令、分组、类型后，本 skill 只改 config/services.json 这一处：跑 scripts/add_service.py 做校验并文本级插入一条服务（可选进 autostart_order），面板按 mtime 热加载、刷新页面即生效，不需要改 server.py / start-all.sh / stop-all.sh / status.sh，不需要新建 start-<id>.sh，不需要重启面板；出错用 --remove 一键回滚。触发词：添加服务、新增本地项目、加入启动项、注册服务、把某项目放进管控台、下线/删除某个服务、看管控台现有分组类型、add service。
---

# Add Service to project-launcher

把一个新的本地服务注册到管控台，或下线已有服务。**唯一要改的文件是 `config/services.json`**，其余都由脚本代劳。

## 架构现状（先读这段，旧流程已作废）

2026-10-10 逐处核对过代码：

| 事实 | 出处 | 对操作的影响 |
|------|------|--------------|
| `config/services.json` 是服务的单一事实源 | `server.py:6` | 加服务 = 往 `services` 数组加一个对象 |
| 面板的 `ConfigStore.load()` 按文件 mtime 热加载 | `server.py:44-50` | **不要** `pkill -f "python3 server.py"`，改完刷新页面即生效 |
| `start-all.sh` / `stop-all.sh` / `status.sh` 都用 `svc_query` 读同一份 JSON | `scripts/utils/service-control.sh:58` 起 | **不要**手改这三个脚本 |
| 单启/单停有通用入口 `scripts/start-service.sh <id>`、`stop-service.sh <id>` | `scripts/start-service.sh` | **不要**再新建 `scripts/start-<id>.sh` |
| `server.py` 里已无 `SERVICES` 字典 | grep 无匹配 | 旧版「更新 server.py SERVICES 字典」这步无处可改 |

旧版 skill 那 7 步（建独立脚本 → 改三个 shell → 改 server.py → 重启面板 → 开浏览器）是配置中心化之前的做法，留着会把人带偏。现在整套流程收进 `scripts/add_service.py`，并且它做的是**文本级插入/删除**：除新增/删除的那几行外文件字节不变，保住这份配置手工排的版（`start`/`stop` 内联成一行、`autostart_order` 每行好几个 id），写完还会 `json.loads` 复验并先备份到 `logs/services.json.bak.<时间戳>`。

## 字段速查

一条服务的可用键（`add_service.py` 的 `ALLOWED_KEYS`，出现别的键直接报错，防手滑写错字段名）：

| 键 | 必填 | 说明 |
|----|------|------|
| `id` | ✅ | kebab-case，管控台与 `start-service.sh` 用的标识 |
| `name` | ✅ | 显示名，习惯带 emoji |
| `type` | ✅ | 取 `type_labels` 的键：`infrastructure` / `management` / `backend` / `frontend` / `tool` |
| `group` | ✅ | 取 `groups` 的 id：`infra` / `hermes` / `local-control` / `tools` / `education` / `fund` / `invest-decision` / `java-interview` |
| `port` | 有端口则给 | 1024-65535；与他人撞端口会被拦（确实共用加 `--allow-port-dup`） |
| `status_cmd` | ✅（有端口可自动生成） | `svc_query` 无条件取这个值，缺了 shell 侧直接 KeyError |
| `start` | 想能「启动」就给 | `{"dir": ..., "cmd": ...}`，`cmd` 必填；`dir` 写相对路径会自动转成 `{project_root}/...` |
| `stop` | 想能「停止」就给 | `{"mode": "cmd"\|"pattern"\|"port", "value": ...}`；`cmd` = 直接跑停止命令，`pattern` = 按 `ps aux \| grep` 杀进程，`port` = 按端口杀（**必须同时给顶层 `port`**，面板只认顶层端口）；既没 `stop` 又没 `port` 时「停止」按钮不可用 |
| `url` | 可选 | 卡片上的「访问」链接 |
| `log_file` | 可选 | 默认 `<id>.log`，落在 `logs/` |
| `self` | 一般别写 | 只有面板自己用：卡片不出「停止」按钮（`server.py:319`），`stop-all.sh` 默认跳过它，要 `--panel` 才停 |
| `terminal_script` | 可选 | 让前端改调 `/execute`，面板同步 `bash scripts/<脚本>`；只适合「跑一下就退出」的脚本，长驻进程会把请求卡住 —— 长驻服务用 `start` |

路径里能用占位符 `{project_root}` `{logs_dir}` `{log_file}`，由 `svc_query` 与 `server.py` 展开。

## 操作步骤

```bash
cd /Users/javaedge/soft/VSProjects/project-launcher
S=skills/add-service/scripts/add_service.py

python3 $S --list                       # 看现有分组 / 类型 / 服务，避免 id、端口撞车
python3 $S --template > /tmp/svc.json   # 拿模板再填（--example 是一个真实条目）
# ……把 /tmp/svc.json 填好
python3 $S --config /tmp/svc.json --dry-run          # 只打印渲染结果与校验，不落盘
python3 $S --config /tmp/svc.json                    # 落盘；一键 start-all 要带上它就加 --autostart
python3 $S --check <id>                                # shell 侧 svc_query + 面板 /status 两侧都读到才算通
python3 $S --remove <id> --yes                         # 回滚（顺带从 autostart_order 摘掉）
```

收信息时缺啥问啥，别一次全问；`name` / `id` / `type` / `group` / `start.cmd` 是绕不开的，其余按服务形态推。写完刷新 http://localhost:8090/ 让用户确认卡片出现在对应分组里。

## 校验清单

- [ ] `--dry-run` 无 ❌（分组、类型、id 唯一、端口不撞、`status_cmd` 齐备都在这一步拦）
- [ ] 正式写入后打印了备份路径；`python3 -c "import json;json.load(open('config/services.json'))"` 通过（脚本内部已复验）
- [ ] `--check <id>` 两行 ✅：shell 侧 `svc_query status` 有它，面板 `/status` 有它
- [ ] 页面上按钮行为符合预期：有 `start` 才能启动，有 `stop` 或 `port` 才能停止
- [ ] 需要一键启动的，确认它在 `autostart_order` 里；不需要就别加
- [ ] 没改过 `server.py`、三个 shell、也没新建 `scripts/start-<id>.sh`

## 坑

- **新建分组**：`groups` 数组里加 `{"id": ..., "title": ..., "chain": true|false}`（`chain: true` 表示卡片上显示「🟢 全链路正常 / 🟡 部分异常」聚合徽标，见 `static/script.js:112-127`），再加服务；否则 `--dry-run` 就报「分组不存在」。
- **无端口服务**（纯进程 / 定时任务）：必须自己给 `status_cmd`，例如 `pgrep -f 'xxx' >/dev/null`；这类服务最好显式给 `stop`。
- **别整份重写 JSON**：`json.dumps(cfg, indent=2)` 会把手工压的行版全冲掉（`start`/`stop` 摊成多行、`autostart_order` 一行一个），diff 会变成整份文件。要改已有条目就直接编辑那几行。
- **`--autostart` 是追加到数组末尾** = 一键启动时最后起。有依赖关系的服务（如前端依赖后端先监听）要手动把它挪到 `autostart_order` 里正确的那一行——脚本只做「插/删」，不懂启动顺序，`--remove` 时会顺带摘掉。
- **面板没读到**：`--check` 里 shell 侧 ✅ 而面板 ❌，多半是 8090 上跑的不是这份仓库的 `server.py`；`lsof -ti :8090` 看一眼再决定要不要重启。
- **测试请用假根并带 `--project-root`**：`--project-root /tmp/xxx` 指到副本上跑，真配置不沾；带这个开关时脚本会跳过 `svc_query` 与面板校验。若在假根里靠目录自定位跑（不加开关），写入照样成功，但 8090 面板读的是真配置，`--check` 必然报 ❌，退出码 1 —— 那是预期的假警报，别当成写坏。

## 实测记录（2026-10-10 改写时跑过）

假根 `/tmp/pltest`（复制真配置 + `scripts/utils/`）与真仓库两边都验：

- 写入 → `--remove` 往返：`services` 数组（不带 `--autostart`）、带 `--autostart` 两种情形均**字节级还原**，包括「末位元素独占一行」这种把换行一起吃掉的边界。
- `autostart_order` 删行首 / 行中 / 行末 id：每次只少那一个 id，其余 id 顺序不变，JSON 合法；连删 3 个也一致。
- `services` 删首条 / 中间条 / 末条后再加回：末条「删→加」字节还原。
- 真仓库跑一条占位服务（`selftest-inert`，端口 8199）：shell 侧 `svc_query status` 与 8090 面板 `/status` 同时读到（面板确实热加载，无需重启），`--remove` 后 md5 与前置快照一致。
- 8 类校验负例全部拦住：未知字段、分组不存在、id 撞车、端口撞车、`stop.mode` 非法、`mode=port` 缺顶层 `port`、`mode=port` 的 value 非数字、value 与顶层端口不符。

改写过程中修掉的五个坑（都已进代码，别再改回去）：

1. `delete_element` 原来只看元素行首有无缩进来判断「是否独占整行」，把 `autostart_order` 行首 id 误判成独占整行，删它会连带整行没了（实测丢了 5 个 id）。现在看两头：前面有值或后面除逗号/闭括号还有值 → 按行内处理。
2. 「独占整行的末位元素」删完保留前一行末尾那个换行，否则上一行会和 `  ]` 黏成一行。
3. `find_root` 不写死 `parents[N]`，改成往上找第一个含 `config/services.json` 的目录。写死 2 层时从 `skills/add-service/scripts/` 定位到的是 `skills/`，真仓库直接报「找不到配置文件」（假根测试因为一直带 `--project-root`，没暴露这个问题）。
4. 成功路径 `return check(...)` 返回布尔值 → `sys.exit(True)` 退出码是 **1**，加服务明明成功却报失败；必须 `return 0 if check(...) else 1`。
5. `stop.mode` 起初只认 `cmd`/`pattern`，把现网 `credits-dashboard` 已在用的 `port` 判成非法；shell 侧三种都支持，面板侧 `port` 走「按顶层端口杀」兜底（`server.py:222`），因此加 `port` 时必须同时有顶层 `port`。

## 迁移来源

本 skill 由 `~/.agents/skills/add-service` 迁移而来（2026-10-10），随仓库自带、不再单独安装；迁移时同步把流程从「改 server.py + 三个 shell + 重启面板」改写为现在的 `config/services.json` 单一事实源流程，`scripts/add_service.py` 已整体重写。原目录已删除。
