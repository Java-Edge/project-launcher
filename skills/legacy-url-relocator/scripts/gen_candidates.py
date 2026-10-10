#!/usr/bin/env python3
"""Deterministic URL variant generator for relocated/dead pages.

Pure string rewriting: no network access, no external dependencies (stdlib only).
Feed each candidate to your host's page-reading tool, highest tier first.

Usage:
    python gen_candidates.py "https://strandsagents.com/0.1.x/user-guide/concepts/tools/tools_overview/"
    python gen_candidates.py "<URL>" --tier 2
    python gen_candidates.py "<URL>" --json
"""

import argparse
import json
import re
import sys
from urllib.parse import urlsplit, urlunsplit, unquote

# Version-like path segments: 0.1.x, v2, 1.0, latest, stable, 2025, en, docs
VERSION_SEG = re.compile(r"^(v?\d+(?:\.\d+){0,2}(?:\.x)?|latest|stable|next|edge|beta|alpha)$")
LOCALE_SEG = re.compile(r"^(en|en-us|zh|zh-cn|zh-hans|ja|de|fr|es|pt|ko|ru)$", re.I)
DOCS_SEG = re.compile(r"^(docs|documentation|guide|handbook|wiki|manual|help|user-guide|learn)$", re.I)

# Suffixes commonly appended or stripped during doc migrations
SUFFIXES = ("index.html", "index.md", "index", "readme", "overview", "index.htm")
UNDERSCORE_TAILS = ("_overview", "_index", "_guide", "_docs", "_intro", "_page")


def _split(url):
    p = urlsplit(url.strip())
    if not p.scheme:
        p = urlsplit("https://" + url.strip())
    segs = [s for s in p.path.split("/") if s]
    return p, segs


def _build(p, segs, query="", frag=""):
    path = "/" + "/".join(segs) if segs else "/"
    # Only keep a trailing slash when the final segment looks like a directory
    # (no file extension). Adding index.html/index.md must not inherit it.
    if segs and p.path.endswith("/") and not re.search(r"\.[A-Za-z0-9]{1,6}$", segs[-1]):
        path += "/"
    return urlunsplit((p.scheme, p.netloc, path, query, frag))


def _title_variants(last):
    """tools_overview -> tools-overview, toolsoverview, tools, tool-overview"""
    out = []
    if "_" in last:
        out.append(last.replace("_", "-"))
        out.append(last.replace("_", ""))
        out.append(last.split("_")[0])
        out.append("-".join(w.capitalize() for w in last.split("_")))
    if "-" in last:
        out.append(last.replace("-", "_"))
        out.append(last.split("-")[0])
    out.append(last.lower())
    out.append(last.capitalize())
    seen, res = set(), []
    for v in out:
        if v and v != last and v not in seen:
            seen.add(v)
            res.append(v)
    return res


def variants(url):
    """Return an ordered list of (tier, url, why) candidates, deduplicated."""
    p, segs = _split(url)
    if not segs:
        return [(1, _build(p, []), "site root")]
    out = []

    def add(t, s, why, q=p.query, f=p.fragment):
        if s != segs or why.startswith("site root"):
            out.append((t, _build(p, s, q, f), why))

    last = segs[-1]
    body = segs[:-1]
    host = p.netloc.lower()
    last_has_ext = bool(re.search(r"\.[A-Za-z0-9]{1,6}$", last))

    # ---- Tier 1: highest-yield, near-deterministic ----
    add(1, body, "parent directory (page folded into its section index)")
    if not last_has_ext:
        add(1, segs + ["index.html"], "explicit index.html")
        add(1, segs + ["index.md"], "Markdown source exposed as page")
    if p.path.endswith("/"):
        out.append((1, _build(p, segs).rstrip("/"), "same path without trailing slash"))
    else:
        out.append((1, _build(p, segs) + "/", "same path with trailing slash"))
    add(1, ["docs"] + segs, "added /docs prefix (very common docs migration)")
    add(1, ["latest"] + segs, "added /latest version prefix")
    if DOCS_SEG.match(segs[0]):
        add(1, segs[1:], "dropped leading /docs segment")

    # ---- Tier 2: version/locale/extension surgery ----
    if VERSION_SEG.match(segs[0]):
        add(2, segs[1:], f"dropped version prefix '{segs[0]}' (archive retired)")
        add(2, ["docs"] + segs[1:], f"dropped version '{segs[0]}' + added /docs")
        add(2, ["latest"] + segs[1:], f"version '{segs[0]}' -> /latest")
        add(2, ["stable"] + segs[1:], f"version '{segs[0]}' -> /stable")
        add(2, segs[1:], "dropped version prefix")
    if LOCALE_SEG.match(segs[0]):
        add(2, segs[1:], f"dropped locale prefix '{segs[0]}'")
        add(2, ["docs"] + segs[1:], f"dropped locale '{segs[0]}' + added /docs")
    if segs and segs[0].lower().replace(".", "").replace("-", "") in (
        "www",
    ):
        pass
    # www <-> apex
    apex = host[4:] if host.startswith("www.") else "www." + host
    out.append((2, urlunsplit((p.scheme, apex, p.path, p.query, p.fragment)), "www <-> apex host swap"))

    for suf in (".html", ".htm", ".md", ".php", ".aspx", ""):
        if not last.endswith(suf or "@@"):
            base = re.sub(r"\.(html?|md|php|aspx?|jspx?)$", "", last)
            if suf:
                add(2, body + [base + suf], f"extension changed to '{suf}'")
            else:
                add(2, body + [base], "extension stripped (clean URLs)")

    # ---- Tier 3: filename rewrites ----
    for v in _title_variants(last):
        add(3, body + [v], f"filename rewrite: {last} -> {v}")
    for tail in UNDERSCORE_TAILS:
        if last.endswith(tail):
            stem = last[: -len(tail)]
            add(3, body + [stem], f"generic suffix '{tail}' dropped")
            add(3, body + [stem.replace("_", "-")], f"generic suffix '{tail}' dropped + hyphenated")
    if "." in last and not last.endswith((".html", ".md", ".htm")):
        add(3, body + [last.replace(".", "-")], "dots -> hyphens")
        add(3, body + [last.replace(".", "_")], "dots -> underscores")

    # ---- Tier 4: structural reorganisation ----
    for i in range(1, len(segs)):
        add(4, segs[i:], f"dropped leading segment '{segs[0]}' (x{i})")
    for pref in ("docs", "documentation", "user-guide", "learn", "en", "latest"):
        add(4, [pref] + segs, f"added /{pref} prefix")
        add(4, body + [pref, last], f"inserted /{pref} before filename")
    if len(body) >= 2:
        add(4, [body[0], last], "collapsed intermediate path segments")
        add(4, [body[-1], last], "kept only deepest section + filename")

    # ---- Tier 5: archive & mirrors ----
    enc = unquote(_build(p, segs))
    out.append((5, f"https://web.archive.org/web/2/{enc}", "Wayback: latest snapshot"))
    out.append((5, f"https://archive.org/wayback/available?url={enc}", "Wayback availability API (JSON)"))
    out.append((5, f"https://{host}/sitemap.xml", "sitemap.xml"))
    out.append((5, f"https://{host}/robots.txt", "robots.txt (may declare Sitemap:)"))
    out.append((5, f"https://{host}/llms.txt", "llms.txt machine-readable page index"))
    out.append((5, f"https://{host}/llms-full.txt", "llms-full.txt full docs corpus"))
    out.append((5, f"https://{host}/docs/llms.txt", "docs-subtree llms.txt"))
    slug_stem = re.split(r"[._-]", last)[0]
    out.append((5, "https://" + host + "/search?q=" + slug_stem, "on-site search for the slug stem"))

    orig = _build(p, segs)
    seen, dedup = set(), []
    for t, u, why in sorted(out, key=lambda x: (x[0], x[1])):
        if u in seen or u == orig:
            continue
        seen.add(u)
        dedup.append((t, u, why))
    return dedup


def main():
    ap = argparse.ArgumentParser(description="Generate candidate URLs for a moved/dead page.")
    ap.add_argument("url", help="the original (dead or stale) URL")
    ap.add_argument("--tier", type=int, default=5, choices=[1, 2, 3, 4, 5],
                    help="max tier to include (1=most conservative, default 5=all)")
    ap.add_argument("--limit", type=int, default=60, help="max candidates (default 60)")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    a = ap.parse_args()

    raw = a.url.strip().strip('"').strip("'")
    probe = urlsplit(raw if "://" in raw else "https://" + raw)
    host_ok = re.match(r"^(?:[A-Za-z0-9_-]+\.)+[A-Za-z]{2,}(:\d+)?$", probe.netloc)
    if not host_ok or re.search(r"\s", raw):
        print(f"ERROR: '{a.url}' is not a valid absolute URL. "
              "Pass one like https://example.com/docs/page/", file=sys.stderr)
        return 2
    url = raw if "://" in raw else "https://" + raw

    rows = [r for r in variants(url) if r[0] <= a.tier][: a.limit]
    if not rows:
        print("No candidates generated; the URL may already be a site root. "
              "Use step 3 (llms.txt / sitemap.xml) instead.", file=sys.stderr)
        return 1

    if a.json:
        print(json.dumps({"original": url, "candidates":
                          [{"tier": t, "url": u, "why": w} for t, u, w in rows]},
                         ensure_ascii=False, indent=2))
    else:
        print(f"# Original: {url}\n# {len(rows)} candidates — probe tier 1 first, stop at first content match.\n")
        cur = None
        for t, u, w in rows:
            if t != cur:
                cur = t
                names = {1: "TIER 1 — near-deterministic", 2: "TIER 2 — version/locale/extension",
                         3: "TIER 3 — filename rewrites", 4: "TIER 4 — structural reorganisation",
                         5: "TIER 5 — archive, sitemap, machine indexes"}
                print(f"\n## {names[t]}")
            print(f"  {u}\n      ↳ {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
