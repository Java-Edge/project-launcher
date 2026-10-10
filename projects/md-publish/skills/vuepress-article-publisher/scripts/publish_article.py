#!/usr/bin/env python3
"""
VuePress 文章发布脚本（编程严选网结构）。

将本地 markdown 文件发布到 VuePress 项目，自动完成：
  1. 复制 md 文件到 docs/md/<专栏>/[<子目录>/]<slug>.md（文件名使用英文 slug，URL 不含中文）
  2. 用 --display-name 补全文章一级标题（sidebar 显示名）
  3. 可选修改 nav（默认不修改，--nav-update 开启）
  4. 修改 sidebar：按 /md/<专栏>/[<子目录>/] 定位分组，追加 slug 到指定子分组
  5. 后台启动 npm run dev 服务

用法：
  # 扁平专栏（文件直接放 docs/md/java/）
  python3 publish_article.py --md-file /path/to/article.md --column java

  # 嵌套专栏（文件放 docs/md/AI/agent/，sidebar 加到"智能体发展"子分组）
  python3 publish_article.py --md-file /path/to/article.md --column AI --subdir agent --sidebar-group "智能体发展"

  # 指定英文 slug 与中文标题（推荐：中文标题配英文文件名，URL 干净）
  python3 publish_article.py --md-file /path/to/article.md --column AI --subdir llm \
    --display-name "“思考模式”是怎么来的？看看这些推理模型的技术思路" \
    --slug reasoning-models-technical-approach

  # 需要同时更新 nav
  python3 publish_article.py --md-file /path/to/article.md --column java --nav-update --display-name "文章标题"
"""

import argparse
import os
import re
import shutil
import socket
import subprocess
import sys
import time


# ---------------------------------------------------------------------------
# 括号匹配与文本定位工具
# ---------------------------------------------------------------------------

def find_matching_bracket(text, open_pos):
    """从 open_pos（指向 '[' 或 '{'）开始，返回匹配关闭括号的索引。忽略字符串内的括号。"""
    if open_pos >= len(text):
        return -1
    bracket = text[open_pos]
    if bracket not in '[{':
        return -1
    close = ']' if bracket == '[' else '}'
    depth = 0
    i = open_pos
    in_string = False
    string_char = None
    while i < len(text):
        c = text[i]
        if in_string:
            if c == '\\':
                i += 2
                continue
            if c == string_char:
                in_string = False
        else:
            if c in ('"', "'", '`'):
                in_string = True
                string_char = c
            elif c == bracket:
                depth += 1
            elif c == close:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1


def line_indent(text, pos):
    """返回 pos 所在行的前导空白。"""
    line_start = text.rfind('\n', 0, pos) + 1
    i = line_start
    while i < len(text) and text[i] in ' \t':
        i += 1
    return text[line_start:i]


def find_array_after_keyword(text, keyword, search_from=0):
    """
    在 text 中从 search_from 开始找 keyword（如 'items:' 或 'children:'），
    定位其后的 '[' 数组，返回 (array_open, array_close, keyword_pos)。
    """
    kw_pos = text.find(keyword, search_from)
    if kw_pos == -1:
        return -1, -1, -1
    bracket_pos = text.find('[', kw_pos + len(keyword))
    if bracket_pos == -1 or bracket_pos - kw_pos > 30:
        return -1, -1, -1
    close_pos = find_matching_bracket(text, bracket_pos)
    if close_pos == -1:
        return -1, -1, -1
    return bracket_pos, close_pos, kw_pos


def insert_into_array(text, array_open, array_close, new_element):
    """
    在数组的关闭括号 ']' 前插入 new_element，自动处理逗号和缩进。
    """
    inner = text[array_open + 1:array_close]
    inner_stripped = inner.rstrip()

    first_non_ws = -1
    for idx, ch in enumerate(inner):
        if ch not in ' \t\n\r':
            first_non_ws = idx
            break
    if first_non_ws >= 0:
        indent = line_indent(text, array_open + 1 + first_non_ws)
    else:
        indent = line_indent(text, array_close) + '    '

    close_indent = line_indent(text, array_open)

    if inner_stripped:
        last_char_pos = array_open + 1 + len(inner_stripped) - 1
        if text[last_char_pos] != ',':
            text = text[:last_char_pos + 1] + ',' + text[last_char_pos + 1:]
            array_close += 1

    pos = array_close
    while pos > 0 and text[pos - 1] in ' \t':
        pos -= 1
    has_newline = (pos < len(text) and text[pos] == '\n')

    if has_newline:
        text = text[:pos] + '\n' + indent + new_element + text[pos:]
    else:
        text = text[:array_close] + '\n' + indent + new_element + '\n' + close_indent + text[array_close:]
    return text


# ---------------------------------------------------------------------------
# nav 配置修改（可选）
# ---------------------------------------------------------------------------

def add_to_nav(config_text, column, subdir, filename, display_name):
    """
    在 nav 中定位专栏的 items 数组，追加文章入口。
    有 subdir 时搜索 /md/<column>/<subdir>/，无 subdir 时搜索 /md/<column>/。
    返回 (new_text, error_msg)。
    """
    path_prefix = f"/md/{column}/{subdir}/" if subdir else f"/md/{column}/"
    patterns = [f"'{path_prefix}", f'"{path_prefix}']
    link_pos = -1
    for p in patterns:
        link_pos = config_text.find(p)
        if link_pos != -1:
            break

    if link_pos == -1:
        return None, f"nav 中未找到 '{path_prefix}' 的现有入口，无法自动定位挂载点。请手动在 nav 中添加。"

    items_kw = 'items:'
    search_end = link_pos
    items_pos = -1
    while True:
        found = config_text.rfind(items_kw, 0, search_end)
        if found == -1:
            break
        bracket_check = config_text.find('[', found + len(items_kw), found + len(items_kw) + 30)
        if bracket_check != -1:
            items_pos = found
            break
        search_end = found

    if items_pos == -1:
        return None, "找到 link 但未找到对应的 items 数组。"

    array_open, array_close, _ = find_array_after_keyword(config_text, items_kw, items_pos)
    if array_open == -1:
        return None, "无法定位 items 数组边界。"

    link_path = f"/md/{column}/{subdir}/{filename}" if subdir else f"/md/{column}/{filename}"
    new_entry = f"{{text: '{display_name}', link: '{link_path}'}}"
    config_text = insert_into_array(config_text, array_open, array_close, new_entry)
    return config_text, None


# ---------------------------------------------------------------------------
# sidebar 配置修改
# ---------------------------------------------------------------------------

def find_sidebar_group(config_text, sidebar_key):
    """
    找到 sidebar 中指定键（如 "/md/AI/agent/"）的分组，返回该分组数组的 (open, close)。
    找不到返回 (-1, -1)。
    """
    patterns = [f'"{sidebar_key}"', f"'{sidebar_key}'"]
    key_pos = -1
    for p in patterns:
        key_pos = config_text.find(p)
        if key_pos != -1:
            break
    if key_pos == -1:
        return -1, -1

    # 键后面是 ': [{', 找到 '['
    bracket_pos = config_text.find('[', key_pos)
    if bracket_pos == -1:
        return -1, -1
    close_pos = find_matching_bracket(config_text, bracket_pos)
    return bracket_pos, close_pos


def find_subgroup_children(config_text, group_open, group_close, subgroup_title):
    """
    在 sidebar 分组内找到指定 title 的子分组的 children 数组，返回 (array_open, array_close)。
    subgroup_title 为 None 时返回第一个子分组的 children。
    """
    group_text = config_text[group_open:group_close]

    if subgroup_title:
        # 搜索 title: "<subgroup_title>"
        title_patterns = [f'title: "{subgroup_title}"', f"title: '{subgroup_title}'"]
        title_pos = -1
        for p in title_patterns:
            idx = group_text.find(p)
            if idx != -1:
                title_pos = group_open + idx
                break
        if title_pos == -1:
            return -1, -1
        search_from = title_pos
    else:
        # 找第一个 title
        title_pos = group_text.find('title:')
        if title_pos == -1:
            return -1, -1
        search_from = group_open + title_pos

    array_open, array_close, _ = find_array_after_keyword(config_text, 'children:', search_from)
    return array_open, array_close


def list_subgroup_titles(config_text, group_open, group_close):
    """列出 sidebar 分组内所有子分组的 title，用于错误提示。"""
    group_text = config_text[group_open:group_close]
    titles = []
    idx = 0
    while True:
        idx = group_text.find('title:', idx)
        if idx == -1:
            break
        # 提取 title 值
        quote_start = group_text.find('"', idx)
        if quote_start == -1:
            quote_start = group_text.find("'", idx)
        if quote_start == -1:
            break
        quote_char = group_text[quote_start]
        quote_end = group_text.find(quote_char, quote_start + 1)
        if quote_end == -1:
            break
        titles.append(group_text[quote_start + 1:quote_end])
        idx = quote_end + 1
    return titles


def add_to_sidebar(config_text, column, subdir, filename, subgroup_title):
    """
    在 sidebar 中定位 /md/<column>/[<subdir>/] 分组，在指定子分组的 children 中追加文件名。
    subgroup_title 为 None 时加到第一个子分组。
    返回 (new_text, error_msg)。
    """
    sidebar_key = f"/md/{column}/{subdir}/" if subdir else f"/md/{column}/"
    group_open, group_close = find_sidebar_group(config_text, sidebar_key)

    if group_open == -1:
        # 分组不存在，新建
        return _add_new_sidebar_group(config_text, sidebar_key, filename, column, subdir)

    # 找到子分组的 children
    array_open, array_close = find_subgroup_children(config_text, group_open, group_close, subgroup_title)

    if array_open == -1:
        available = list_subgroup_titles(config_text, group_open, group_close)
        if subgroup_title:
            return None, f"sidebar 分组 '{sidebar_key}' 中未找到子分组 '{subgroup_title}'。可用子分组：{available}"
        else:
            return None, f"sidebar 分组 '{sidebar_key}' 中未找到任何子分组。"

    new_entry = f'"{filename}"'
    config_text = insert_into_array(config_text, array_open, array_close, new_entry)
    return config_text, None


def _add_new_sidebar_group(config_text, sidebar_key, filename, column, subdir):
    """在 sidebar 对象末尾新建一个分组。"""
    sidebar_kw = 'sidebar:'
    sidebar_pos = config_text.find(sidebar_kw)
    if sidebar_pos == -1:
        return None, "config.js 中未找到 sidebar 配置。"

    brace_pos = config_text.find('{', sidebar_pos, sidebar_pos + 30)
    if brace_pos == -1:
        return None, "无法定位 sidebar 对象。"
    close_brace = find_matching_bracket(config_text, brace_pos)
    if close_brace == -1:
        return None, "无法定位 sidebar 对象结束位置。"

    inner = config_text[brace_pos + 1:close_brace]
    first_non_ws = -1
    for idx, ch in enumerate(inner):
        if ch not in ' \t\n\r':
            first_non_ws = idx
            break
    if first_non_ws >= 0:
        key_indent = line_indent(config_text, brace_pos + 1 + first_non_ws)
    else:
        key_indent = line_indent(config_text, close_brace) + '    '

    item_indent = key_indent + '    '
    child_indent = key_indent + '        '
    group_title = subdir if subdir else column

    new_group = (
        f'{key_indent}"{sidebar_key}": [{{\n'
        f'{item_indent}title: "{group_title}",\n'
        f'{item_indent}collapsable: false,\n'
        f'{item_indent}sidebarDepth: 0,\n'
        f'{item_indent}children: [\n'
        f'{child_indent}"{filename}"\n'
        f'{item_indent}]\n'
        f'{key_indent}}}],\n'
    )

    inner_stripped = inner.rstrip()
    if inner_stripped:
        last_char_pos = brace_pos + 1 + len(inner_stripped) - 1
        if config_text[last_char_pos] != ',':
            config_text = config_text[:last_char_pos + 1] + ',' + config_text[last_char_pos + 1:]
            close_brace += 1

    pos = close_brace
    while pos > 0 and config_text[pos - 1] in ' \t':
        pos -= 1
    if pos > 0 and config_text[pos - 1] == '\n':
        config_text = config_text[:pos] + new_group + config_text[pos:]
    else:
        config_text = config_text[:close_brace] + '\n' + new_group + config_text[close_brace:]

    return config_text, None


# ---------------------------------------------------------------------------
# 文件名（slug）生成与校验
# ---------------------------------------------------------------------------

def generate_slug(name):
    """
    从标题/文件名中提取 ASCII 英文单词，生成 kebab-case slug。
    纯中文或仅剩数字编号时返回空串（无法生成有意义的英文 slug）。
    """
    name = name or ''
    if name.lower().endswith('.md'):
        name = name[:-3]
    s = re.sub(r'[^A-Za-z0-9]+', '-', name)
    s = re.sub(r'-+', '-', s).strip('-').lower()
    # 必须包含至少一个字母，避免 slug 退化成纯数字编号（如日期前缀）
    if not re.search(r'[a-z]', s):
        return ''
    return s


def validate_filename(filename):
    """检查 slug 是否包含 VuePress 可能不支持的特殊字符，返回问题字符列表。"""
    name = filename[:-3] if filename.endswith('.md') else filename
    issues = []
    for ch in ['(', ')', '（', '）', '【', '】', '#', '<', '>', '?', '？', ' ', '_', '.']:
        if ch in name:
            issues.append(ch)
    return issues


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def detect_project_root():
    """从当前目录向上查找包含 docs/.vuepress/config.js 的项目根目录。"""
    current = os.getcwd()
    while True:
        candidate = os.path.join(current, 'docs', '.vuepress', 'config.js')
        if os.path.isfile(candidate):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def port_in_use(port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', int(port)))
    sock.close()
    return result == 0


def main():
    parser = argparse.ArgumentParser(description='VuePress 文章发布工具')
    parser.add_argument('--md-file', required=True, help='本地 markdown 文件绝对路径')
    parser.add_argument('--column', required=True, help='专栏目录名（如 AI、java、spring）')
    parser.add_argument('--subdir', default=None, help='子目录名（如 agent、ml、llm），文件将放到 docs/md/<column>/<subdir>/')
    parser.add_argument('--sidebar-group', default=None, help='sidebar 子分组标题（如 "智能体发展"），不指定则加到第一个子分组')
    parser.add_argument('--display-name', default=None, help='文章标题，用于补全一级标题（sidebar 显示名）；--nav-update 时兼作 nav 显示名')
    parser.add_argument('--slug', default=None, help='英文 slug 文件名（不含扩展名，如 reasoning-models-technical-approach）。不指定时自动从标题提取 ASCII 英文生成；纯中文标题无法自动生成时必须用此参数指定')
    parser.add_argument('--nav-update', action='store_true', help='是否更新 nav（默认不更新）')
    parser.add_argument('--port', default='8081', help='dev 服务端口（默认 8081）')
    parser.add_argument('--no-dev', action='store_true', help='只修改配置，不启动 dev 服务')
    parser.add_argument('--project-root', default=None, help='VuePress 项目根目录（默认自动向上检测）')
    args = parser.parse_args()

    # 1. 校验 md 文件
    md_file = os.path.abspath(args.md_file)
    if not os.path.isfile(md_file):
        print(f"[错误] 文件不存在：{md_file}", file=sys.stderr)
        sys.exit(1)

    original_filename = os.path.basename(md_file)
    original_stem = original_filename[:-3] if original_filename.endswith('.md') else original_filename

    # 确定英文 slug（URL 文件名，不含中文）
    slug = args.slug
    if slug is not None:
        slug = slug.strip().strip('/').replace(' ', '-')
    else:
        slug = generate_slug(args.display_name or original_stem)
    if not slug:
        print("[错误] 标题为纯中文，无法自动生成英文 slug（URL 不能含中文）。", file=sys.stderr)
        print("[错误] 请用 --slug 指定英文文件名，例如：--slug reasoning-models-technical-approach", file=sys.stderr)
        sys.exit(1)
    filename = slug + '.md'

    print(f"[信息] 源文件：{md_file}")
    print(f"[信息] 文件名（slug）：{filename}")
    print(f"[信息] 文章标题：{args.display_name or original_stem}")
    print(f"[信息] 专栏：{args.column}" + (f" / 子目录：{args.subdir}" if args.subdir else ""))
    if args.sidebar_group:
        print(f"[信息] sidebar 子分组：{args.sidebar_group}")
    print(f"[信息] 更新 nav：{'是' if args.nav_update else '否（默认）'}")

    # 2. slug 特殊字符校验（正常生成的 slug 应为纯小写字母数字连字符）
    issues = validate_filename(filename)
    if issues:
        print(f"[警告] 文件名包含可能导致渲染异常的字符：{''.join(issues)}", file=sys.stderr)
        print("[警告] README 要求文件名只含小写字母、数字和连字符，建议改用 --slug 指定。", file=sys.stderr)

    # 3. 检测项目根目录
    project_root = args.project_root
    if project_root is None:
        project_root = detect_project_root()
    if project_root is None:
        print("[错误] 无法自动检测 VuePress 项目根目录，请用 --project-root 指定。", file=sys.stderr)
        sys.exit(1)
    project_root = os.path.abspath(project_root)

    config_path = os.path.join(project_root, 'docs', '.vuepress', 'config.js')
    if not os.path.isfile(config_path):
        print(f"[错误] config.js 不存在：{config_path}", file=sys.stderr)
        sys.exit(1)
    print(f"[信息] 项目根目录：{project_root}")

    # 4. 确认/创建目标目录
    if args.subdir:
        target_dir = os.path.join(project_root, 'docs', 'md', args.column, args.subdir)
    else:
        target_dir = os.path.join(project_root, 'docs', 'md', args.column)
    if not os.path.isdir(target_dir):
        os.makedirs(target_dir, exist_ok=True)
        print(f"[信息] 已创建目录：{target_dir}")

    # 5. 复制 md 文件
    dest_path = os.path.join(target_dir, filename)
    if os.path.exists(dest_path):
        print(f"[警告] 目标位置已存在同名文件，将被覆盖：{dest_path}", file=sys.stderr)
    shutil.copy2(md_file, dest_path)
    print(f"[信息] 已复制到：{dest_path}")

    # 5b. 检查并补全一级标题（VuePress sidebar 用一级标题作为显示名）
    with open(dest_path, 'r', encoding='utf-8') as f:
        article_content = f.read()
    has_h1 = any(line.startswith('# ') and not line.startswith('## ') for line in article_content.split('\n'))
    if not has_h1:
        h1_title = args.display_name if args.display_name else original_stem
        article_content = f"# {h1_title}\n\n" + article_content
        with open(dest_path, 'w', encoding='utf-8') as f:
            f.write(article_content)
        print(f"[信息] 文章无一级标题，已自动补全：# {h1_title}")

    # 6. 备份 config.js
    backup_path = config_path + '.bak.' + str(int(time.time()))
    shutil.copy2(config_path, backup_path)
    print(f"[信息] 已备份 config.js：{backup_path}")

    # 7. 读取并修改 config.js
    with open(config_path, 'r', encoding='utf-8') as f:
        config_text = f.read()

    display_name = args.display_name
    if display_name is None:
        display_name = original_stem

    # 7a. 修改 nav（仅 --nav-update 时）
    if args.nav_update:
        config_text, nav_err = add_to_nav(config_text, args.column, args.subdir, slug, display_name)
        if nav_err:
            print(f"[nav 警告] {nav_err}", file=sys.stderr)
            print("[nav 警告] 跳过 nav 修改。", file=sys.stderr)
            with open(backup_path, 'r', encoding='utf-8') as f:
                config_text = f.read()
        else:
            print("[信息] 已更新 nav 配置")
    else:
        print("[信息] 跳过 nav 更新（默认行为，文章通过 sidebar 和直接 URL 访问）")

    # 7b. 修改 sidebar（插入 slug，不带 .md，与项目现有 sidebar 风格一致）
    config_text, sidebar_err = add_to_sidebar(config_text, args.column, args.subdir, slug, args.sidebar_group)
    if sidebar_err:
        print(f"[错误] sidebar 配置失败：{sidebar_err}", file=sys.stderr)
        print(f"[错误] 已从备份恢复 config.js：{backup_path}", file=sys.stderr)
        shutil.copy2(backup_path, config_path)
        sys.exit(1)
    print("[信息] 已更新 sidebar 配置")

    # 8. 写回 config.js
    with open(config_path, 'w', encoding='utf-8') as f:
        f.write(config_text)
    print(f"[信息] 已保存 config.js")

    # 9. 启动 dev 服务
    if not args.no_dev:
        if port_in_use(args.port):
            print(f"[信息] 端口 {args.port} 已被占用，dev 服务可能已在运行。")
        else:
            print(f"[信息] 正在后台启动 dev 服务（端口 {args.port}）...")
            log_file = os.path.join(project_root, 'vuepress-dev.log')
            with open(log_file, 'w') as logf:
                proc = subprocess.Popen(
                    ['npm', 'run', 'dev', '--', '--port', args.port],
                    cwd=project_root,
                    stdout=logf,
                    stderr=subprocess.STDOUT,
                    start_new_session=True
                )
            print(f"[信息] dev 服务已启动，PID: {proc.pid}")
            print(f"[信息] 日志文件：{log_file}")
            print("[信息] 等待 dev 服务启动（约 15 秒）...")
            time.sleep(15)
            if port_in_use(args.port):
                print("[信息] dev 服务端口已就绪。")
            else:
                print("[警告] 15 秒后端口仍未就绪，dev 服务可能启动较慢，请查看日志。", file=sys.stderr)

    # 10. 输出结果（VuePress 1.x 页面路由为 .html）
    page_name = slug + '.html'
    if args.subdir:
        article_url = f"http://localhost:{args.port}/md/{args.column}/{args.subdir}/{page_name}"
    else:
        article_url = f"http://localhost:{args.port}/md/{args.column}/{page_name}"

    print()
    print("=" * 60)
    print("发布完成！")
    print(f"  文章文件：{dest_path}")
    print(f"  专栏/子目录：{args.column}" + (f"/{args.subdir}" if args.subdir else ""))
    if args.sidebar_group:
        print(f"  sidebar 子分组：{args.sidebar_group}")
    print(f"  文章标题：{display_name}")
    print(f"  访问地址：{article_url}")
    print(f"  首页地址：http://localhost:{args.port}/")
    if not args.no_dev and not port_in_use(args.port):
        print(f"  启动日志：{os.path.join(project_root, 'vuepress-dev.log')}")
    print("=" * 60)


if __name__ == '__main__':
    main()
