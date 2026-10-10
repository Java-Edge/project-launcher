#!/usr/bin/env python3
"""51CTO 发文预处理：解析本地 Markdown -> 发布所需的结构化 JSON。

用法:
    python3 prepare_article.py <article.md> [--title "自定义标题"] [--tags "A,B"] [--pid 31] [--cate 15]

输出（stdout, JSON）:
    {
      "title": "...",
      "body_b64": "<base64 UTF-8 正文，已去 frontmatter>",
      "body_chars": 1234,
      "pid": "31", "pidName": "后端开发",
      "cate_id": "15", "cateName": "Java",      # 无二级分类时为 ""
      "tags": ["Java", "架构"],                  # 1~5 个
      "abstract": "...",                         # <=500 字
      "local_images": ["..."]                    # 正文中的本地图片（需手动处理）
    }

设计要点（均来自实操验证，勿随意改动）:
- 分类 ID 取 references/categories.json（51CTO /category/get-child 权威接口快照）。
- 正文经 base64 输出，供 ego-browser 的 js() 内部 atob() 解码，避免反引号/$/换行破坏脚本。
- 只依赖标准库，不装第三方包。
"""

import argparse
import base64
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CATE_PATH = os.path.join(HERE, "..", "references", "categories.json")

# 一级分类关键词命中权重表（正文关键词 -> L1 名称）。
# 仅在 frontmatter 未显式指定时使用；取总分最高者。
L1_KEYWORDS = [
    ("后端开发", ["java", "spring", "spring boot", "springboot", "jvm", "并发", "多线程",
                  "网关", "gateway", "dubbo", "rpc", "netty", "maven", "gradle", "servlet",
                  "mybatis", "tomcat", "scala", "php", "python", "go语言", "golang", ".net"]),
    ("前端开发", ["vue", "react", "javascript", "typescript", "webpack", "vite", "css",
                  "html", "node.js", "nodejs", "jquery", "前端", "dom", "sass", "scss"]),
    ("数据库", ["mysql", "redis", "oracle", "mongodb", "nosql", "sql", "数据库", "索引",
                "分库分表", "事务", "hbase", "sql server"]),
    ("移动开发", ["android", "ios", "swift", "kotlin", "微信开发", "html5", "移动端", "flutter"]),
    ("人工智能", ["机器学习", "深度学习", "神经网络", "nlp", "计算机视觉", "pytorch",
                  "tensorflow", "transformer", "算法", "数据挖掘", "数据分析"]),
    ("服务器", ["nginx", "服务器", "负载均衡", "集群", "分布式", "windows server", "邮件服务器"]),
    ("大数据", ["hadoop", "spark", "hive", "storm", "数据仓库", "yarn", "flink", "kafka"]),
    ("云计算", ["docker", "kubernetes", "k8s", "云原生", "openstack", "虚拟化", "云服务", "容器"]),
    ("运维", ["运维", "监控", "ci/cd", "jenkins", "发布部署", "shell", "linux", "ansible"]),
    ("网络安全", ["安全", "漏洞", "渗透", "加密", " firewall", "xss", "csrf", "防火墙"]),
    ("代码人生", ["职场", "面试", "感悟", "复盘", "成长", "跳槽", "副业", "效率"]),
    ("AIGC", ["aigc", "midjourney", "stable diffusion", "文心一言", "copilot", "ai作画",
              "ai写作", "图像生成", "数字人", "视频生成"]),
    ("AI 编程", ["ai ide", "cursor", "代码生成", "无代码开发", "ai 编程", "代码编辑"]),
    ("AI 智能体", ["agent", "智能体", "mcp", "自动化 agent", "编程 agent"]),
    ("大模型", ["大模型", "llm", "gpt", "qwen", "deepseek", "多模态", "微调", "推理", "rag"]),
    ("AI 助手", ["ai 助手", "对话助手", "多模型聚合"]),
    ("AI 开发平台", ["算力平台", "微调平台", "大模型开发", "agent 开发"]),
    ("模型工具", ["本地部署", "ollama", "lm studio", "模型调用"]),
    ("区块链", ["区块链", "以太坊", "智能合约", "web3"]),
    ("物联网", ["物联网", "iot", "嵌入式", "车路云", "v2x", "路侧", "rsu"]),
    ("音视频", ["音视频", "webrtc", "rtmp", "流媒体", "编解码"]),
    ("低代码", ["低代码", "零代码", "nocode", "lowcode"]),
    ("考试认证", ["软考", "认证", "考试", "pmp"]),
    ("软件测试", ["测试", "自动化测", "单元测试", "junit", "pytest", "测试用"]),
    ("数字化转型", ["数字化转型", "中台", "信息化"]),
]

# 常见技术名词 -> 标签候选（受控之外的自由标签，51CTO 标签为自由输入）
TAG_KEYWORDS = [
    "Java", "Spring Boot", "Spring Cloud", "微服务", "JVM", "并发编程", "Netty", "MySQL",
    "Redis", "Kafka", "RabbitMQ", "Docker", "Kubernetes", "Nginx", "Linux", "Git",
    "Vue", "React", "TypeScript", "JavaScript", "Node.js", "Webpack", "大模型", "LLM",
    "RAG", "Transformer", "机器学习", "深度学习", "Python", "Go", "Golang", "架构",
    "分布式", "高并发", "性能优化", "设计模式", "运维", "监控", "CI/CD", "V2X", "车路云",
    "Cesium", "WebGL", "数字孪生", "MQTT",
]


def load_categories():
    with open(CATE_PATH, encoding="utf-8") as f:
        return json.load(f)


def parse_frontmatter(text):
    """极简 frontmatter 解析：支持 key: value / key: [a, b] / 多行 | 文本。"""
    fm = {}
    if not text.startswith("---"):
        return fm, text
    end = text.find("\n---", 3)
    if end == -1:
        return fm, text
    block = text[3:end].strip("\n")
    body = text[end + 4:].lstrip("\n")
    key = None
    for line in block.split("\n"):
        if not line.strip() or line.strip().startswith("#"):
            continue
        if re.match(r"^\s*-\s+", line) and key:
            # 列表项
            val = re.sub(r"^\s*-\s+", "", line).strip().strip("\"'")
            fm.setdefault(key, [])
            if isinstance(fm[key], list):
                fm[key].append(val)
            continue
        m = re.match(r"^([A-Za-z_\-][A-Za-z0-9_\-]*)\s*:\s*(.*)$", line)
        if m:
            key, raw = m.group(1).lower(), m.group(2).strip()
            if raw.startswith("[") and raw.endswith("]"):
                inner = raw[1:-1].strip()
                fm[key] = [x.strip().strip("\"'") for x in inner.split(",") if x.strip()]
            elif raw in ("", "|", ">"):
                fm[key] = ""
            else:
                fm[key] = raw.strip("\"'")
    return fm, body


def strip_md(text):
    """去掉代码块/图片/链接语法，得到用于关键词统计的纯文本。"""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`[^`]*`", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    return text


def infer_category(plain, categories, hint_pid=None, hint_cate=None):
    """返回 (pid, pidName, cate_id, cateName)。"""
    by_name = {c["name"]: c for c in categories}
    if hint_pid:
        node = by_name.get(hint_pid) or next(
            (c for c in categories if c["id"] == str(hint_pid)), None)
        if node:
            child = next((x for x in node["children"]
                          if hint_cate and (x["name"] == hint_cate or x["id"] == str(hint_cate))), None)
            return (node["id"], node["name"],
                    child["id"] if child else "", child["name"] if child else "")

    low = plain.lower()
    best, best_score = None, 0
    for name, kws in L1_KEYWORDS:
        score = sum(low.count(kw) for kw in kws)
        if score > best_score:
            best, best_score = name, score
    node = by_name.get(best) if best else None
    if not node:
        node = by_name.get("后端开发")  # 兜底

    # 二级分类：在该 L1 的子类里按名称出现次数打分
    child, cscore, cbest = "", "", 0
    for c in node["children"]:
        s = low.count(c["name"].lower())
        if s > cbest:
            cbest, child, cscore = s, c["id"], c["name"]
    # 兜底：若该 L1 存在子分类，51CTO 强制要求选二级（否则发布被"请选择二级分类"拦截）。
    # 没有任何关键词命中时，默认取第一个子类，避免 cate_id 为空导致发布失败。
    if not child and node["children"]:
        child, cbest = node["children"][0]["id"], node["children"][0]["name"]
    return (node["id"], node["name"], child, cbest)


def infer_tags(plain, fm_tags, limit=5):
    tags = []
    for t in (fm_tags or []):
        t = str(t).strip()
        if t and t not in tags:
            tags.append(t)
    low = plain.lower()
    scored = []
    for kw in TAG_KEYWORDS:
        n = low.count(kw.lower())
        if n > 0:
            scored.append((n, kw))
    scored.sort(reverse=True)
    for _, kw in scored:
        if len(tags) >= limit:
            break
        if not any(kw.lower() == t.lower() for t in tags):
            tags.append(kw)
    # 兜底：至少 1 个标签（51CTO 标签必填）
    if not tags:
        tags = ["技术分享"]
    return tags[:limit]


def clean_for_abstract(text, limit=500):
    """去掉 Markdown 标记，得到适合做摘要的纯文本。"""
    t = strip_md(text)
    t = re.sub(r"^[=-]{3,}$", " ", t, flags=re.M)          # 分页/分隔线
    t = re.sub(r"^\s{0,3}#{1,6}\s*", "", t, flags=re.M)     # 标题 #
    t = re.sub(r"^\s{0,3}>\s?", "", t, flags=re.M)          # 引用 >
    t = re.sub(r"^\s*[-*+]\s+", "", t, flags=re.M)          # 列表符号
    t = re.sub(r"^\s*\|.*\|\s*$", " ", t, flags=re.M)       # 表格行
    t = re.sub(r"\*{1,3}|_{2,}|`", "", t)                   # 强调/行内码
    t = re.sub(r"\s+", " ", t).strip()
    return t[:limit]


def infer_abstract(fm, body, limit=500):
    for k in ("summary", "description", "abstract", "摘要"):
        v = fm.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()[:limit]
    return clean_for_abstract(body, 200)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("md")
    ap.add_argument("--title")
    ap.add_argument("--tags")
    ap.add_argument("--pid")
    ap.add_argument("--cate")
    args = ap.parse_args()

    path = os.path.abspath(os.path.expanduser(args.md))
    if not os.path.isfile(path):
        sys.exit("文件不存在: " + path)

    raw = open(path, encoding="utf-8").read()
    fm, body = parse_frontmatter(raw)

    title = (args.title or fm.get("title")
             or (re.search(r"^#\s+(.+)$", body, re.M).group(1).strip() if re.search(r"^#\s+(.+)$", body, re.M) else "")
             or os.path.splitext(os.path.basename(path))[0])
    title = title.strip()[:100]

    plain = strip_md(body)
    categories = load_categories()

    fm_tags = fm.get("tags") or []
    if isinstance(fm_tags, str):
        fm_tags = [x.strip() for x in re.split(r"[,，;；]", fm_tags) if x.strip()]
    if args.tags:
        fm_tags = [x.strip() for x in args.tags.split(",") if x.strip()] + list(fm_tags)

    pid, pid_name, cate_id, cate_name = infer_category(
        plain, categories, args.pid or fm.get("category") or fm.get("pid"),
        args.cate or fm.get("cate"))

    local_images = re.findall(r"!\[[^\]]*\]\((?!https?:|//)([^)]+)\)", body)

    out = {
        "title": title,
        "body_b64": base64.b64encode(body.encode("utf-8")).decode("ascii"),
        "body_chars": len(body),
        "pid": pid, "pidName": pid_name,
        "cate_id": cate_id, "cateName": cate_name,
        "tags": infer_tags(plain, fm_tags),
        "abstract": infer_abstract(fm, body),
        "local_images": local_images,
        "publish": str(fm.get("publish", "true")).lower() not in ("false", "0", "no"),
    }
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
