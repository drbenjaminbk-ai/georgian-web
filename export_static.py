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


def main() -> None:
    if DOCS_DIR.exists():
        shutil.rmtree(DOCS_DIR)

    shutil.copytree(STATIC_DIR, DOCS_DIR)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    payload = app.bootstrap()
    for section in payload["sections"]:
        section["questions"] = app.section_questions(section["id"])

    with open(DATA_DIR / "site.json", "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))

    print(f"Built {DOCS_DIR}")


if __name__ == "__main__":
    main()
