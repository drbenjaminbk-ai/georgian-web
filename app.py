#!/usr/bin/env python3
"""Local web app for the Georgian citizenship language test."""

from __future__ import annotations

import json
import random
import re
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
STATIC_DIR = ROOT / "static"
PDF_PATH = DATA_DIR / "questions.pdf"
HINTS_PATH = DATA_DIR / "hints.json"

SECTION_NAMES = {
    "I.1": "Грамматика - падежи",
    "I.2": "Грамматика - время глагола",
    "I.3": "Грамматика - вопросительные слова",
    "I.4": "Грамматика - союзы",
    "II.1": "Лексика - категории слов",
    "II.2": "Лексика - речевые фразы",
    "II.3": "Лексика - словосочетания",
    "III.1": "Чтение - объявления",
    "III.2": "Чтение - диалоги",
    "III.3": "Чтение - тексты",
}

SECTION_ORDER = [
    "I.1",
    "I.2",
    "I.3",
    "I.4",
    "II.1",
    "II.2",
    "II.3",
    "III.1",
    "III.2",
    "III.3",
]

GEO = ["ა", "ბ", "გ", "დ"]


def parse_questions(pdf_path: Path) -> list[dict]:
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError("Install pdfplumber: python3 -m pip install pdfplumber") from exc

    with pdfplumber.open(str(pdf_path)) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    full_text = re.sub(
        r"ტესტები საქართველოს მოქალაქეობის მოპოვებისათვის ქართულ ენაში\n?",
        "",
        full_text,
    )

    answer_pat = re.compile(
        r"((?:I{1,3}|IV|V)\.(?:I{1,3}|IV|V|\d+)\.\d+)\.?\s*[-–]\s*([აბგდ])\)"
    )
    answers = {m.group(1): m.group(2) for m in answer_pat.finditer(full_text)}

    block_pat = re.compile(r"((?:I{1,3}|IV|V)\.(?:\d+)\.\d+)\.")
    parts = block_pat.split(full_text)

    questions = []
    i = 1
    while i < len(parts) - 1:
        q_id = parts[i].strip()
        block = parts[i + 1]
        i += 2

        match = re.match(r"((?:I{1,3}|IV|V)\.\d+)\.", q_id + ".")
        if not match:
            continue

        section = match.group(1)
        if section not in SECTION_ORDER:
            continue

        opts: dict[str, str] = {}
        choice_pat = re.compile(
            r"([აბგდ])\)\s*(.+?)(?=\n[აბგდ]\)|\n[IVX]+\.\d+|\Z)",
            re.DOTALL,
        )
        for choice_match in choice_pat.finditer(block):
            text = choice_match.group(2).strip().rstrip(";").rstrip(".")
            opts[choice_match.group(1)] = re.sub(r"\s+", " ", text)

        if len(opts) < 4:
            continue

        first = block.find("ა)")
        if first == -1:
            continue

        q_text = block[:first].strip()
        q_text = re.sub(
            r"\n?" + re.escape(q_id) + r"\.?\s*[-–]\s*[აბგდ]\).*",
            "",
            q_text,
        ).strip()
        q_text = re.sub(r"\s+", " ", q_text)

        answer = answers.get(q_id)
        if not answer:
            continue

        questions.append(
            {
                "id": q_id,
                "sec": section,
                "sectionName": SECTION_NAMES.get(section, section),
                "question": q_text,
                "opts": [opts.get(g, "") for g in GEO],
                "ans": GEO.index(answer),
            }
        )

    return questions


def load_hints(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as file:
        data = json.load(file)
    return {item["id"]: item for item in data}


def group_by_section(questions: list[dict]) -> dict[str, list[dict]]:
    sections: dict[str, list[dict]] = {section: [] for section in SECTION_ORDER}
    for question in questions:
        if question["sec"] in sections:
            sections[question["sec"]].append(question)
    return sections


QUESTIONS = parse_questions(PDF_PATH)
SECTIONS = group_by_section(QUESTIONS)
HINTS = load_hints(HINTS_PATH)


def public_question(question: dict) -> dict:
    hint_data = HINTS.get(question["id"], {})
    return {
        **question,
        "hint": hint_data.get("hint", ""),
        "rule": hint_data.get("rule", ""),
    }


def exam_questions() -> list[dict]:
    return [
        public_question(random.choice(SECTIONS[section]))
        for section in SECTION_ORDER
        if SECTIONS.get(section)
    ]


def section_questions(section: str) -> list[dict]:
    return [public_question(question) for question in SECTIONS.get(section, [])]


def bootstrap() -> dict:
    return {
        "total": len(QUESTIONS),
        "sections": [
            {
                "id": section,
                "name": SECTION_NAMES[section],
                "count": len(SECTIONS.get(section, [])),
            }
            for section in SECTION_ORDER
        ],
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        path = unquote(self.path.split("?", 1)[0])

        if path == "/api/bootstrap":
            self.send_json(bootstrap())
            return

        if path == "/api/exam":
            self.send_json({"mode": "exam", "questions": exam_questions()})
            return

        if path.startswith("/api/section/"):
            section = path.removeprefix("/api/section/")
            questions = section_questions(section)
            if not questions:
                self.send_json({"error": "Section not found"}, HTTPStatus.NOT_FOUND)
                return
            self.send_json({"mode": "study", "section": section, "questions": questions})
            return

        if path == "/":
            self.path = "/index.html"

        super().do_GET()

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    port = 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Loaded {len(QUESTIONS)} questions and {len(HINTS)} hints.")
    print(f"Open http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
