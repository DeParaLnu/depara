"""Перевірки PR без моделі: прості правила, які код ловить надійніше за малу модель.

Кожна перевірка дивиться лише на рядки, які PR додає, і повертає пункти у форматі зауважень ревʼюера.
Значення секретів у пункти не потрапляють: цитата маскується, бо коментар у PR бачать усі.
"""

from __future__ import annotations

import json
import re

MAX_PER_RULE = 3  # одна помилка, повторена у двадцяти рядках, не має заповнити коментар

# (назва, вираз): формати, які майже не дають хибних спрацювань
SECRET_PATTERNS = (
    ("приватний ключ", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("ключ доступу AWS", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("токен GitHub", re.compile(r"\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}")),
    ("ключ API", re.compile(r"\b(?:tgp_v1_|sk-(?:proj-|ant-)?)[A-Za-z0-9_-]{20,}")),
    ("токен Slack", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("ключ Google API", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
)
# Загальний випадок: змінній із «секретною» назвою присвоєно довгий рядок, схожий на справжнє значення
SECRET_ASSIGN = re.compile(
    r"(?i)\b([A-Z0-9_.-]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)[A-Z0-9_]*)"
    r"[\"']?\s*[:=]\s*[\"'`]?([A-Za-z0-9+/=_-]{20,})")
CONNECTION_PASSWORD = re.compile(r"\b[a-z][a-z0-9+.-]*://([^\s:/@'\"`${}<>]+):([^\s@'\"`${}<>]{8,})@")
PLACEHOLDER = re.compile(r"(?i)example|change[-_]?me|your|xxxx|placeholder|dummy|fake|sample|secret|password|token|test|local|dev")
ENV_FILE = re.compile(r"(^|/)\.env(\.(?!example$|sample$|template$)[^/]*)?$")
TEST_PATH = re.compile(r"(^|/)(test|tests|e2e|__tests__)/|\.test\.|\.spec\.|\.e2e\.|(^|/)test_[^/]*\.py$")

ERROR_VALUE = re.compile(r"\berror[\"']?\s*:\s*(['\"`])([^'\"`]*)\1")
ERROR_CODE = re.compile(r"^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$")
MESSAGE_ONLY = re.compile(r"\.code\(\s*[45]\d\d\s*\)\s*\.send\(\s*\{\s*(message|msg|reason)\b")
ROUTE_FILE = re.compile(r"^backend/src/routes/[^/]+\.ts$")
ROUTE_DEF = re.compile(r"\b\w+\.(get|post|put|patch|delete)\(\s*['\"`](/[^'\"`]*)")
COMMENT = re.compile(r"^\s*(//|/\*|\*|\*/)")
DEPENDENCY = re.compile(r"^\s*\"((?:@[\w.-]+/)?[\w.-]+)\"\s*:\s*\"([^\"]+)\"\s*,?\s*$")
DEP_SECTIONS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")
VERSION = re.compile(r"^(?:[\^~<>=]*\d|\*|latest|npm:|github:|git\+|file:|workspace:|https?:)")


def _finding(rule: str, file: str, line: int, severity: str, title: str, evidence: str, problem: str, fix: str) -> dict:
    return {"rule": rule, "file": file, "line": line, "severity": severity, "title": title,
            "evidence": evidence, "problem": problem, "fix": fix}


def mask(text: str, secret: str) -> str:
    """Рядок без значення секрету: лишаються перші 4 символи, щоб автор упізнав, про що мова."""
    return text.replace(secret, secret[:4] + "…(приховано)") if secret else text


def _looks_real(value: str) -> bool:
    """Чи схоже значення на справжній секрет, а не на заглушку з прикладу чи назву змінної."""
    if PLACEHOLDER.search(value) or len(set(value)) < 8:
        return False
    return bool(re.search(r"\d", value) and re.search(r"[A-Za-z]", value))


def check_secrets(files: dict[str, dict]) -> list[dict]:
    out: list[dict] = []
    for path, info in files.items():
        if ENV_FILE.search(path) and info.get("new_file"):
            out.append(_finding("secrets", path, 1, "critical", "Файл .env потрапив у коміт", "",
                                "Файли .env містять секрети середовища і не мають бути в репозиторії: значення лишиться в історії git.",
                                "Прибрати файл з коміту, додати в .gitignore, а значення, що вже потрапили в історію, замінити."))
            continue
        for line, text in info.get("added", []):
            hit = next(((name, m.group(0)) for name, rx in SECRET_PATTERNS for m in [rx.search(text)] if m), None)
            if hit is None:
                m = SECRET_ASSIGN.search(text)
                # у тестах і прикладах довгі рядки з «секретними» назвами це зазвичай фікстури
                if m and _looks_real(m.group(2)) and not TEST_PATH.search(path) and "process.env" not in text:
                    hit = (f"значення {m.group(1)}", m.group(2))
            if hit is None:
                m = CONNECTION_PASSWORD.search(text)
                if m and m.group(2) != m.group(1) and _looks_real(m.group(2)) and not TEST_PATH.search(path):
                    hit = ("пароль у рядку підключення", m.group(2))
            if hit:
                out.append(_finding("secrets", path, line, "critical", f"Схоже на секрет у коді: {hit[0]}", mask(text, hit[1]),
                                    "Значення потрапить в історію git і його побачать усі, хто має доступ до репозиторію; diff також надсилається моделі.",
                                    "Прибрати з коду, перенести в секрети середовища і замінити саме значення (воно вже скомпрометоване)."))
    return out


def check_error_format(files: dict[str, dict]) -> list[dict]:
    """Помилки API мають вигляд { error: "КОД_ВЕЛИКИМИ" }: клієнт розрізняє їх за кодом."""
    out: list[dict] = []
    for path, info in files.items():
        if not path.startswith("backend/src/") or not path.endswith(".ts") or TEST_PATH.search(path):
            continue
        for line, text in info.get("added", []):
            if COMMENT.match(text):
                continue
            m = ERROR_VALUE.search(text)
            if m and "${" not in m.group(2) and not ERROR_CODE.match(m.group(2)):
                out.append(_finding("error_format", path, line, "minor", f"Код помилки не у форматі КОД_ВЕЛИКИМИ: «{m.group(2)[:40]}»", text,
                                    "У проєкті помилки API повертаються як { error: \"КОД_ВЕЛИКИМИ\" }: мобільний клієнт показує текст за кодом, а довільний рядок не розпізнає.",
                                    "Замінити на код великими літерами з підкресленнями й додати його в специфікацію."))
            elif MESSAGE_ONLY.search(text):
                out.append(_finding("error_format", path, line, "minor", "Відповідь з помилкою без поля error", text,
                                    "Відповідь зі статусом 4xx/5xx надсилає лише текст: клієнт очікує { error: \"КОД_ВЕЛИКИМИ\" } і не розпізнає таку помилку.",
                                    "Надсилати { error: \"КОД\" }."))
    return out


def check_routes_have_e2e(files: dict[str, dict]) -> list[dict]:
    """Змінено код маршруту, а в PR немає жодного файла з backend/test/e2e."""
    if any(p.startswith("backend/test/e2e/") for p in files):
        return []
    out: list[dict] = []
    for path, info in files.items():
        if not ROUTE_FILE.match(path):
            continue
        code = [(n, t) for n, t in info.get("added", []) if t.strip() and not COMMENT.match(t)]
        if not code:
            continue
        added = [(n, t, m) for n, t in code for m in [ROUTE_DEF.search(t)] if m]
        if added:
            line, text, m = added[0]
            names = ", ".join(f"{x.group(1).upper()} {x.group(2)}" for _, _, x in added[:4])
            out.append(_finding("route_e2e", path, line, "important", f"Новий маршрут без E2E-тесту: {names}"[:120], text,
                                "PR додає маршрут, але не змінює жодного файла в backend/test/e2e: поведінку нового ендпоінта ніщо не перевіряє.",
                                "Додати сценарій у backend/test/e2e (успіх, помилка валідації, доступ без входу)."))
        else:
            line, text = code[0]
            out.append(_finding("route_e2e", path, line, "minor", "Змінено код маршрутів без змін в E2E-тестах", text,
                                "PR змінює логіку ендпоінтів у цьому файлі, але не змінює жодного файла в backend/test/e2e. "
                                "Якщо поведінка для клієнта змінилась, наявні тести цього не перевіряють.",
                                "Додати або оновити сценарій у backend/test/e2e, або зазначити в описі PR, що поведінка не змінилась."))
    return out


def check_dependencies(files: dict[str, dict], read_text) -> list[dict]:
    """Нові пакети в package.json: їх варто побачити людині, а лок-файл має змінитись разом із ними."""
    out: list[dict] = []
    for path, info in files.items():
        if path.rsplit("/", 1)[-1] != "package.json":
            continue
        removed = {m.group(1) for t in info.get("removed", []) for m in [DEPENDENCY.match(t)] if m}
        declared = None
        try:
            data = json.loads(read_text(path) or "")
            declared = {name for section in DEP_SECTIONS for name in (data.get(section) or {})}
        except (ValueError, AttributeError, TypeError):
            pass  # файла немає чи він не JSON: судимо лише за виглядом рядка
        new = []
        for line, text in info.get("added", []):
            m = DEPENDENCY.match(text)
            if not m or m.group(1) in removed or not VERSION.match(m.group(2)):
                continue  # не пакет або лише зміна версії
            if declared is not None and m.group(1) not in declared:
                continue  # такий самий на вигляд рядок з scripts чи іншої секції
            new.append((line, text.strip(), m.group(1)))
        if not new:
            continue
        folder = path.rsplit("/", 1)[0] + "/" if "/" in path else ""
        names = ", ".join(n for _, _, n in new[:8]) + (f" і ще {len(new) - 8}" if len(new) > 8 else "")
        hint = " У mobile/ пакети додаються через npx expo install, щоб версія відповідала SDK." if path.startswith("mobile/") else ""
        out.append(_finding("dependencies", path, new[0][0], "minor", f"Нові залежності: {names}"[:120], new[0][1],
                            "PR додає пакети. Варто свідомо підтвердити, що вони потрібні, підтримуються і не тягнуть зайвого." + hint,
                            "Згадати нові пакети в описі PR."))
        if not any(p == f"{folder}package-lock.json" for p in files):
            out.append(_finding("dependencies", path, new[0][0], "important", "Нові залежності без оновленого package-lock.json", new[0][1],
                                f"У {path} зʼявились пакети ({names}), але {folder}package-lock.json у PR не змінено: npm ci у CI і на сервері впаде або поставить іншу версію.",
                                f"Запустити npm install у {folder or 'корені'} і закомітити лок-файл."))
    return out


def run(files: dict[str, dict], read_text) -> list[dict]:
    """Усі перевірки. files: шлях → {"added": [(номер, рядок)], "removed": [рядок], "new_file": bool}."""
    out: list[dict] = []
    for found in (check_secrets(files), check_error_format(files), check_routes_have_e2e(files), check_dependencies(files, read_text)):
        per_rule: dict[str, int] = {}
        for f in found:
            per_rule[f["rule"]] = per_rule.get(f["rule"], 0) + 1
            if per_rule[f["rule"]] <= MAX_PER_RULE:
                out.append(f)
        extra = sum(max(0, n - MAX_PER_RULE) for n in per_rule.values())
        if extra and out:
            out[-1]["problem"] += f" Таких місць ще {extra}."
    return out
