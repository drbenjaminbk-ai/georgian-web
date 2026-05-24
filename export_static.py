#!/usr/bin/env python3
"""Build static files for GitHub Pages."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import app


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DOCS_DIR = ROOT / "docs"
DATA_DIR = DOCS_DIR / "data"
STATIC_DATA_DIR = STATIC_DIR / "data"


def main() -> None:
    if DOCS_DIR.exists():
        shutil.rmtree(DOCS_DIR)

    shutil.copytree(STATIC_DIR, DOCS_DIR)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DOCS_DIR / ".nojekyll").write_text("", encoding="utf-8")

    payload = app.bootstrap()
    for section in payload["sections"]:
        section["questions"] = app.section_questions(section["id"])
    for section in payload["historySections"]:
        section["questions"] = app.history_section_questions(section["id"])
    for section in payload["lawSections"]:
        section["questions"] = app.law_section_questions(section["id"])

    for data_dir in (DATA_DIR, STATIC_DATA_DIR):
        data_dir.mkdir(parents=True, exist_ok=True)
        with open(data_dir / "site.json", "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))

    print(f"Built {DOCS_DIR}")


if __name__ == "__main__":
    main()
