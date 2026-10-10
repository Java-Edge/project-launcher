#!/usr/bin/env python3
"""Extract first-pass source snippets for work-report PPT drafting.

This script intentionally uses only the Python standard library so it can run
in most Codex environments. It is a discovery helper, not a replacement for
opening high-value sources directly.
"""

from __future__ import annotations

import argparse
import csv
import html
import re
import sys
import zipfile
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


TEXT_EXTS = {".md", ".markdown", ".txt"}
TABLE_EXTS = {".csv", ".tsv"}
OFFICE_EXTS = {".pptx", ".xlsx"}
DEFAULT_EXTS = TEXT_EXTS | TABLE_EXTS | OFFICE_EXTS


def clean_text(value: str) -> str:
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value.replace("\u3000", " ")).strip()
    return value


def read_text_file(path: Path, max_chars: int) -> str:
    text = path.read_text("utf-8", errors="ignore")
    return text[:max_chars]


def extract_pptx(path: Path, max_slides: int) -> str:
    rows: list[str] = []
    ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        slide_names = sorted(
            [name for name in archive.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml")],
            key=lambda name: int("".join(ch for ch in Path(name).stem if ch.isdigit()) or "0"),
        )
        for index, slide_name in enumerate(slide_names[:max_slides], start=1):
            root = ET.fromstring(archive.read(slide_name))
            texts = [clean_text(node.text or "") for node in root.findall(".//a:t", ns)]
            texts = [text for text in texts if text]
            if texts:
                rows.append(f"slide {index}: " + " | ".join(texts[:40]))
    return "\n".join(rows)


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    result: list[str] = []
    for si in root.findall(".//a:si", ns):
        parts = [node.text or "" for node in si.findall(".//a:t", ns)]
        result.append(clean_text("".join(parts)))
    return result


def cell_value(cell: ET.Element, strings: list[str]) -> str:
    value_node = cell.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
    if value_node is None or value_node.text is None:
        inline = cell.find(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
        return clean_text(inline.text or "") if inline is not None else ""
    raw = value_node.text
    if cell.attrib.get("t") == "s":
        try:
            return strings[int(raw)]
        except (ValueError, IndexError):
            return raw
    return clean_text(raw)


def extract_xlsx(path: Path, max_rows: int, max_sheets: int) -> str:
    rows: list[str] = []
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        sheet_names = sorted(
            [name for name in archive.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", name)],
            key=lambda name: int(re.search(r"sheet(\d+)", name).group(1)),
        )
        for sheet_index, sheet_name in enumerate(sheet_names[:max_sheets], start=1):
            root = ET.fromstring(archive.read(sheet_name))
            ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            rows.append(f"sheet {sheet_index}:")
            emitted = 0
            for row in root.findall(".//a:sheetData/a:row", ns):
                values = [cell_value(cell, strings) for cell in row.findall("a:c", ns)]
                values = [value for value in values if value]
                if values:
                    rows.append("  - " + " | ".join(values[:12]))
                    emitted += 1
                    if emitted >= max_rows:
                        break
    return "\n".join(rows)


def extract_table(path: Path, max_rows: int) -> str:
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    rows: list[str] = []
    with path.open("r", encoding="utf-8", errors="ignore", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        for index, row in enumerate(reader):
            if index >= max_rows:
                break
            rows.append(" | ".join(clean_text(cell) for cell in row[:12]))
    return "\n".join(rows)


def iter_files(root: Path, exts: set[str]) -> Iterable[Path]:
    skip_dirs = {".git", "node_modules", ".venv", "venv", "dist", "build"}
    for path in root.rglob("*"):
        if any(part in skip_dirs for part in path.parts):
            continue
        if path.is_file() and path.suffix.lower() in exts:
            yield path


def score_path(path: Path, keywords: list[str]) -> int:
    haystack = str(path).lower()
    return sum(1 for keyword in keywords if keyword.lower() in haystack)


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract source snippets for work-report PPT drafting.")
    parser.add_argument("--root", required=True, help="Workspace or folder to scan.")
    parser.add_argument("--keywords", default="", help="Comma-separated keywords used to rank files.")
    parser.add_argument("--extensions", default=",".join(sorted(DEFAULT_EXTS)), help="Comma-separated extensions.")
    parser.add_argument("--max-files", type=int, default=30)
    parser.add_argument("--max-chars", type=int, default=4000)
    parser.add_argument("--max-rows", type=int, default=30)
    parser.add_argument("--max-slides", type=int, default=12)
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.exists():
        print(f"root does not exist: {root}", file=sys.stderr)
        return 2

    keywords = [item.strip() for item in args.keywords.split(",") if item.strip()]
    exts = {item if item.startswith(".") else f".{item}" for item in args.extensions.split(",") if item.strip()}
    files = sorted(iter_files(root, exts), key=lambda path: (-score_path(path, keywords), str(path)))[: args.max_files]

    print(f"# Work Report Source Extract\n\nroot: `{root}`\nfiles: {len(files)}\n")
    for path in files:
        rel = path.relative_to(root)
        print(f"\n## {rel}\n")
        try:
            suffix = path.suffix.lower()
            if suffix in TEXT_EXTS:
                print(read_text_file(path, args.max_chars))
            elif suffix in TABLE_EXTS:
                print(extract_table(path, args.max_rows))
            elif suffix == ".pptx":
                print(extract_pptx(path, args.max_slides))
            elif suffix == ".xlsx":
                print(extract_xlsx(path, args.max_rows, 4))
        except Exception as exc:  # noqa: BLE001 - report extraction failures per file.
            print(f"[extract failed: {exc}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
