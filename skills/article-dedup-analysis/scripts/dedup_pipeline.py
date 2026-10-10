#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""文章库重复内容排查流水线。

用法:
  python3 dedup_pipeline.py <文章根目录> <输出目录> [--min-section-chars 80] [--shingle 8]

产物（写入 <输出目录>）:
  corpus_sections.jsonl     每篇文件的标题、归一化长度、整篇指纹、板块清单
  dup_articles.json         整篇近重复聚类（含两两 jaccard / containment）
  dup_sections.json         跨文章重复板块聚类
  exact_dup_sections.json   逐字完全相同的板块组
"""
import argparse, hashlib, json, os, re
from collections import defaultdict

EXCLUDED_DIRS = {"node_modules"}  # 其余排除所有点开头目录（.git/.kilo/.workbuddy*/.obsidian 等）

# 检测阈值（可按语料特点微调）
ART_MIN_SH, ART_BANDS, ART_MAX_BUCKET = 10, 16, 30      # 整篇级
ART_J, ART_C = 0.55, 0.75
SEC_MIN_SH, SEC_BANDS, SEC_MAX_BUCKET = 8, 24, 40       # 板块级
SEC_J, SEC_C = 0.60, 0.80

def normalize(text):
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`[^`]*`", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    return re.sub(r"\W+", "", text, flags=re.UNICODE)   # 去空白、标点、符号，保留中英文与数字

def shingle_ids(norm, k):
    if len(norm) < k:
        return {norm} if norm else set()
    return {norm[i:i + k] for i in range(len(norm) - k + 1)}

def md5_8(s):
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:8]

def scan(root, min_chars, k):
    records = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in EXCLUDED_DIRS]
        for fn in filenames:
            if not fn.lower().endswith(".md"):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, root)
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    raw = f.read()
            except OSError:
                continue
            sections, cur_head, buf, h1 = [], "(开头)", [], None
            for ln in raw.splitlines():
                m = re.match(r"^(#{1,3})\s+(.*)", ln)
                if m and m.group(1) in ("#", "##"):
                    if cur_head != "(开头)" or buf:
                        sections.append((cur_head, "\n".join(buf)))
                    if m.group(1) == "#" and h1 is None:
                        h1 = m.group(2).strip()
                    cur_head, buf = m.group(2).strip(), []
                else:
                    buf.append(ln)
            if cur_head != "(开头)" or buf:
                sections.append((cur_head, "\n".join(buf)))
            norm_full = normalize(raw)
            sec_recs = []
            for head, text in sections:
                n = normalize(text)
                if len(n) < min_chars:
                    continue
                sec_recs.append({"head": head[:80], "chars": len(n),
                                 "hash": hashlib.md5(n.encode("utf-8")).hexdigest()[:12],
                                 "sh": [md5_8(s) for s in shingle_ids(n, k)]})
            records.append({"rel": rel, "title": h1 or os.path.splitext(fn)[0],
                            "norm_len": len(norm_full),
                            "full_sh": [md5_8(s) for s in shingle_ids(norm_full, k)],
                            "sections": sec_recs})
    return records

def signature(sh_list, bands):
    hs = [int(h, 16) for h in sh_list]
    return [min(((h * 2654435761 + b * 40503) % (2 ** 32)) for h in hs) if hs else 0
            for b in range(bands)]

def candidate_pairs(items, bands, max_bucket, min_sh):
    buckets, pairs = defaultdict(list), set()
    for i, sh in enumerate(items):
        if len(sh) < min_sh:
            continue
        for b, v in enumerate(signature(sh, bands)):
            buckets[(b, v)].append(i)
    for idxs in buckets.values():
        if 1 < len(idxs) <= max_bucket:
            for a in range(len(idxs)):
                for b2 in range(a + 1, len(idxs)):
                    pairs.add((idxs[a], idxs[b2]))
    return pairs

def jac(a, b):
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb) if sa and sb else 0.0

def cont(a, b):
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return max(len(sa & sb) / len(sa), len(sa & sb) / len(sb))

class DSU:
    def __init__(self, n):
        self.p = list(range(n))
    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb

def cluster(n_items, links):
    dsu = DSU(n_items)
    for i, j in links:
        dsu.union(i, j)
    groups = defaultdict(list)
    for i in range(n_items):
        groups[dsu.find(i)].append(i)
    return sorted((m for m in groups.values() if len(m) > 1), key=len, reverse=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("outdir")
    ap.add_argument("--min-section-chars", type=int, default=80)
    ap.add_argument("--shingle", type=int, default=8)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    records = scan(args.root, args.min_section_chars, args.shingle)
    with open(os.path.join(args.outdir, "corpus_sections.jsonl"), "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # 1) 整篇近重复
    pairs = candidate_pairs([r["full_sh"] for r in records], ART_BANDS, ART_MAX_BUCKET, ART_MIN_SH)
    links, art_pairs = [], []
    for i, j in pairs:
        jj, cc = jac(records[i]["full_sh"], records[j]["full_sh"]), cont(records[i]["full_sh"], records[j]["full_sh"])
        if jj >= ART_J or cc >= ART_C:
            links.append((i, j))
            art_pairs.append({"a": records[i]["rel"], "b": records[j]["rel"],
                              "jaccard": round(jj, 3), "containment": round(cc, 3)})
    art_clusters = [{"members": [{"rel": records[m]["rel"], "norm_len": records[m]["norm_len"]}
                                 for m in g],
                     "pairs": [p for p in art_pairs if any(p["a"] == records[m]["rel"] and p["b"] == records[n]["rel"] for m in g for n in g)]}
                    for g in cluster(len(records), links)]
    with open(os.path.join(args.outdir, "dup_articles.json"), "w", encoding="utf-8") as f:
        json.dump(art_clusters, f, ensure_ascii=False, indent=1)

    # 2) 跨文章重复板块
    secs = []
    for r in records:
        for s in r["sections"]:
            secs.append({"rel": r["rel"], "head": s["head"], "chars": s["chars"],
                         "hash": s["hash"], "sh": s["sh"]})
    pairs = candidate_pairs([s["sh"] for s in secs], SEC_BANDS, SEC_MAX_BUCKET, SEC_MIN_SH)
    links, n_cross = [], 0
    for i, j in pairs:
        if secs[i]["rel"] == secs[j]["rel"]:
            continue
        jj, cc = jac(secs[i]["sh"], secs[j]["sh"]), cont(secs[i]["sh"], secs[j]["sh"])
        if jj >= SEC_J or cc >= SEC_C:
            links.append((i, j))
            n_cross += 1
    sec_groups = []
    for g in cluster(len(secs), links):
        rels = {secs[m]["rel"] for m in g}
        if len(rels) < 2:
            continue
        sec_groups.append({
            "n": len(g), "n_files": len(rels),
            "chars": max(secs[m]["chars"] for m in g),
            "items": [{"rel": secs[m]["rel"], "head": secs[m]["head"], "chars": secs[m]["chars"],
                       "exact_hash": secs[m]["hash"]}
                      for m in sorted(g, key=lambda m: -secs[m]["chars"])]})
    sec_groups.sort(key=lambda x: (-x["n_files"], -x["chars"]))
    with open(os.path.join(args.outdir, "dup_sections.json"), "w", encoding="utf-8") as f:
        json.dump(sec_groups, f, ensure_ascii=False, indent=1)

    # 3) 逐字完全相同的板块组
    by_hash = defaultdict(list)
    for s in secs:
        by_hash[s["hash"]].append({"rel": s["rel"], "head": s["head"], "chars": s["chars"]})
    exact = [v for v in by_hash.values() if len({x["rel"] for x in v}) >= 2]
    exact.sort(key=lambda v: -max(x["chars"] for x in v))
    with open(os.path.join(args.outdir, "exact_dup_sections.json"), "w", encoding="utf-8") as f:
        json.dump(exact, f, ensure_ascii=False, indent=1)

    print("scanned files:", len(records))
    print("sections kept:", len(secs))
    print("article dup clusters:", len(art_clusters), "| verified pairs:", len(art_pairs))
    print("section dup groups:", len(sec_groups), "| verified cross-file pairs:", n_cross)
    print("exact-same section groups:", len(exact))

if __name__ == "__main__":
    main()
