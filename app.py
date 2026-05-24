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
HISTORY_PDF_PATH = DATA_DIR / "history.pdf"
LAW_PDF_PATH = DATA_DIR / "law.pdf"
HINTS_PATH = DATA_DIR / "hints.json"
TRANSLATIONS_PATH = DATA_DIR / "translations.json"
HISTORY_HINTS_PATH = DATA_DIR / "history_hints.json"
LAW_HINTS_PATH = DATA_DIR / "law_hints.json"

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

HISTORY_BLOCKS = {
    "ancient": {
        "name": "Древность / до IV века",
        "id_range": [1, 24],
        "description": "Древнейшая история, Колхида, Диაოхи, Фарнаваз, ранняя государственность",
    },
    "iv_x": {
        "name": "IV-X века",
        "id_range": [25, 64],
        "description": "Христианизация, Святая Нино, Вахтанг Горгасали, арабы, Тао-Кларджети",
    },
    "xi_xv": {
        "name": "XI-XV века",
        "id_range": [65, 117],
        "description": "Объединенная Грузия, Давид IV, Тамар, монголы, Георгий V, распад царства",
    },
    "xvi_xviii": {
        "name": "XVI-XVIII века",
        "id_range": [118, 150],
        "description": "Османы и Иран, Шах-Аббас, Георгий Саакадзе, Вахтанг VI, Ираклий II",
    },
    "xix": {
        "name": "XIX век",
        "id_range": [151, 166],
        "description": "Российская империя, восстания, тергдалеулеби, Илья Чавчавадзе",
    },
    "xx_modern": {
        "name": "XX век и новейшая история",
        "id_range": [167, 200],
        "description": "Первая республика, советизация, независимость, новейшая история",
    },
}

HISTORY_BLOCK_ORDER = ["ancient", "iv_x", "xi_xv", "xvi_xviii", "xix", "xx_modern"]
HISTORY_QUOTA_V1 = {
    "ancient": 1,
    "iv_x": 2,
    "xi_xv": 2,
    "xvi_xviii": 2,
    "xix": 1,
    "xx_modern": 2,
}
HISTORY_MODEL_COMMENT = (
    "Это не официальный алгоритм, а вероятностная модель, построенная на "
    "структуре банка вопросов и анализе реальных экзаменационных вариантов."
)

LAW_SECTION_ORDER = [f"law_{index}" for index in range(1, 11)]
LAW_SECTIONS = {
    f"law_{index}": {
        "name": f"Право — вопросы {(index - 1) * 20 + 1}-{index * 20}",
        "id_range": [(index - 1) * 20 + 1, index * 20],
        "quota": 1,
    }
    for index in range(1, 11)
}


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
    return {str(item["id"]): item for item in data}


def load_translations(path: Path) -> dict[str, dict]:
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


def classify_history_block(question_id: int) -> str:
    for block, meta in HISTORY_BLOCKS.items():
        start, end = meta["id_range"]
        if start <= question_id <= end:
            return block
    raise ValueError(f"Unknown history question id: {question_id}")


def parse_history_questions(pdf_path: Path) -> list[dict]:
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError("Install pdfplumber: python3 -m pip install pdfplumber") from exc

    with pdfplumber.open(str(pdf_path)) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    full_text = re.sub(
        r"ტესტები საქართველოს მოქალაქეობის მოპოვებისათვის საქართველოს ისტორიაში\n?",
        "",
        full_text,
    )
    full_text = re.sub(r"(?m)^\d+\s*$", "", full_text)

    parts = re.split(r"(?m)^\s*(\d{1,3})\.\s+", full_text)
    questions = []

    for index in range(1, len(parts) - 1, 2):
        question_id = int(parts[index])
        block_text = parts[index + 1]
        if not 1 <= question_id <= 200:
            continue

        answer_match = re.search(
            r"სწორი პასუხ(?:ია|ი):\s*([აბგდ])\)\s*(.+?)(?=\n\s*\d{1,3}\.\s+|\Z)",
            block_text,
            re.DOTALL,
        )
        if not answer_match:
            continue

        first = block_text.find("ა)")
        if first == -1:
            continue

        question_text = re.sub(r"\s+", " ", block_text[:first].strip())
        choices_text = block_text[first:answer_match.start()]

        opts: dict[str, str] = {}
        choice_pat = re.compile(r"([აბგდ])\)\s*(.+?)(?=\n[აბგდ]\)|\Z)", re.DOTALL)
        for choice_match in choice_pat.finditer(choices_text):
            text = choice_match.group(2).strip().rstrip(";").rstrip(".")
            opts[choice_match.group(1)] = re.sub(r"\s+", " ", text)

        if len(opts) != 4:
            continue

        answer = answer_match.group(1)
        block = classify_history_block(question_id)
        questions.append(
            {
                "id": question_id,
                "subject": "history",
                "block": block,
                "sectionName": HISTORY_BLOCKS[block]["name"],
                "question": question_text,
                "opts": [opts.get(g, "") for g in GEO],
                "ans": GEO.index(answer),
                "model": "history_v1",
            }
        )

    return questions


def group_by_history_block(questions: list[dict]) -> dict[str, list[dict]]:
    blocks: dict[str, list[dict]] = {block: [] for block in HISTORY_BLOCK_ORDER}
    for question in questions:
        blocks[question["block"]].append(question)
    return blocks


def classify_law_section(question_id: int) -> str:
    if not 1 <= question_id <= 200:
        raise ValueError(f"Unknown law question id: {question_id}")
    return f"law_{((question_id - 1) // 20) + 1}"


def parse_law_questions(pdf_path: Path) -> list[dict]:
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError("Install pdfplumber: python3 -m pip install pdfplumber") from exc

    with pdfplumber.open(str(pdf_path)) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    full_text = re.sub(
        r"ტესტები საქართველოს მოქალაქეობის მოპოვებისათვის სამართლის ძირითად საფუძვლებში\n?",
        "",
        full_text,
    )
    full_text = re.sub(r"(?m)^\d+\s*$", "", full_text)

    parts = re.split(r"(?m)^\s*(\d{1,3})\.\s+", full_text)
    questions = []

    for index in range(1, len(parts) - 1, 2):
        question_id = int(parts[index])
        block_text = parts[index + 1]
        if not 1 <= question_id <= 200:
            continue

        answer_match = re.search(
            r"სწორი პასუხ(?:ი|ია)\s*:\s*([აბგდ])\)?",
            block_text,
        )
        if not answer_match:
            continue

        first_choice = re.search(r"[აბგდ][\).]", block_text)
        if not first_choice:
            continue

        question_text = re.sub(r"\s+", " ", block_text[: first_choice.start()].strip())
        choices_text = block_text[first_choice.start() : answer_match.start()]

        opts: dict[str, str] = {}
        choice_pat = re.compile(r"([აბგდ])[\).]\s*(.+?)(?=\n[აბგდ][\).]|\Z)", re.DOTALL)
        for choice_match in choice_pat.finditer(choices_text):
            text = choice_match.group(2).strip().rstrip(";").rstrip(".")
            opts[choice_match.group(1)] = re.sub(r"\s+", " ", text)

        if len(opts) != 4:
            continue

        answer = answer_match.group(1)
        section = classify_law_section(question_id)
        questions.append(
            {
                "id": question_id,
                "subject": "law",
                "section": section,
                "sectionName": LAW_SECTIONS[section]["name"],
                "question": question_text,
                "opts": [opts.get(g, "") for g in GEO],
                "ans": GEO.index(answer),
            }
        )

    return questions


def group_by_law_section(questions: list[dict]) -> dict[str, list[dict]]:
    sections: dict[str, list[dict]] = {section: [] for section in LAW_SECTION_ORDER}
    for question in questions:
        sections[question["section"]].append(question)
    return sections


QUESTIONS = parse_questions(PDF_PATH)
SECTIONS = group_by_section(QUESTIONS)
HINTS = load_hints(HINTS_PATH)
TRANSLATIONS = load_translations(TRANSLATIONS_PATH)
HISTORY_QUESTIONS = parse_history_questions(HISTORY_PDF_PATH)
HISTORY_SECTIONS = group_by_history_block(HISTORY_QUESTIONS)
HISTORY_HINTS = load_hints(HISTORY_HINTS_PATH)
LAW_QUESTIONS = parse_law_questions(LAW_PDF_PATH)
LAW_GROUPS = group_by_law_section(LAW_QUESTIONS)
LAW_HINTS = load_hints(LAW_HINTS_PATH)


def public_question(question: dict) -> dict:
    hint_data = HINTS.get(question["id"], {})
    translation_data = TRANSLATIONS.get(question["id"], {})
    opts = translation_data.get("opts_geo", question["opts"])
    return {
        **question,
        "opts": opts,
        "hint": hint_data.get("hint", ""),
        "rule": hint_data.get("rule", ""),
        "translation": {
            key: value
            for key, value in translation_data.items()
            if key != "opts_geo"
        },
    }


def public_history_question(question: dict) -> dict:
    aid_data = HISTORY_HINTS.get(str(question["id"]), {})
    return {
        **question,
        "hint": aid_data.get("hint", ""),
        "rule": aid_data.get("rule", ""),
        "translation": {
            key: value
            for key, value in aid_data.items()
            if key not in {"id", "hint", "rule"}
        },
    }


def public_law_question(question: dict) -> dict:
    aid_data = LAW_HINTS.get(str(question["id"]), {})
    return {
        **question,
        "hint": aid_data.get("hint", ""),
        "rule": aid_data.get("rule", ""),
        "translation": {
            key: value
            for key, value in aid_data.items()
            if key not in {"id", "hint", "rule"}
        },
    }


def exam_questions() -> list[dict]:
    return [
        public_question(random.choice(SECTIONS[section]))
        for section in SECTION_ORDER
        if SECTIONS.get(section)
    ]


def section_questions(section: str) -> list[dict]:
    return [public_question(question) for question in SECTIONS.get(section, [])]


def history_exam_questions() -> list[dict]:
    questions = []
    for block in HISTORY_BLOCK_ORDER:
        quota = HISTORY_QUOTA_V1[block]
        questions.extend(random.sample(HISTORY_SECTIONS[block], quota))
    random.shuffle(questions)
    return [public_history_question(question) for question in questions]


def history_section_questions(block: str) -> list[dict]:
    return [public_history_question(question) for question in HISTORY_SECTIONS.get(block, [])]


def law_exam_questions() -> list[dict]:
    questions = [
        random.choice(LAW_GROUPS[section])
        for section in LAW_SECTION_ORDER
        if LAW_GROUPS.get(section)
    ]
    random.shuffle(questions)
    return [public_law_question(question) for question in questions]


def law_section_questions(section: str) -> list[dict]:
    return [public_law_question(question) for question in LAW_GROUPS.get(section, [])]


def bootstrap() -> dict:
    return {
        "total": len(QUESTIONS),
        "historyTotal": len(HISTORY_QUESTIONS),
        "lawTotal": len(LAW_QUESTIONS),
        "sections": [
            {
                "id": section,
                "name": SECTION_NAMES[section],
                "count": len(SECTIONS.get(section, [])),
            }
            for section in SECTION_ORDER
        ],
        "historySections": [
            {
                "id": block,
                "name": HISTORY_BLOCKS[block]["name"],
                "description": HISTORY_BLOCKS[block]["description"],
                "count": len(HISTORY_SECTIONS.get(block, [])),
                "quota": HISTORY_QUOTA_V1[block],
            }
            for block in HISTORY_BLOCK_ORDER
        ],
        "historyModel": {
            "name": "history_v1",
            "confidence": "high",
            "quota": HISTORY_QUOTA_V1,
            "comment": HISTORY_MODEL_COMMENT,
        },
        "lawSections": [
            {
                "id": section,
                "name": LAW_SECTIONS[section]["name"],
                "count": len(LAW_GROUPS.get(section, [])),
                "quota": LAW_SECTIONS[section]["quota"],
            }
            for section in LAW_SECTION_ORDER
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

        if path == "/api/history/exam":
            self.send_json(
                {
                    "mode": "history-exam",
                    "model": bootstrap()["historyModel"],
                    "questions": history_exam_questions(),
                }
            )
            return

        if path == "/api/history/model":
            self.send_json(bootstrap()["historyModel"])
            return

        if path == "/api/law/exam":
            self.send_json({"mode": "law-exam", "questions": law_exam_questions()})
            return

        if path.startswith("/api/law/section/"):
            section = path.removeprefix("/api/law/section/")
            questions = law_section_questions(section)
            if not questions:
                self.send_json({"error": "Law section not found"}, HTTPStatus.NOT_FOUND)
                return
            self.send_json({"mode": "law-study", "section": section, "questions": questions})
            return

        if path.startswith("/api/history/block/"):
            block = path.removeprefix("/api/history/block/")
            questions = history_section_questions(block)
            if not questions:
                self.send_json({"error": "History block not found"}, HTTPStatus.NOT_FOUND)
                return
            self.send_json({"mode": "history-study", "section": block, "questions": questions})
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
    print(f"Loaded {len(QUESTIONS)} language questions and {len(HINTS)} hints.")
    print(f"Loaded {len(HISTORY_QUESTIONS)} history questions.")
    print(f"Loaded {len(LAW_QUESTIONS)} law questions.")
    print(f"Open http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
