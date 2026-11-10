"""Підрахунок метрик eval: чистий код без мережі, щоб його можна було перевірити тестами.

Мітки кейса:
  issues       зауваження. real=true реальна проблема, real=false хибне, real=null ще не розмічено й не рахується ніде.
  known_false  твердження, які люди вже спростували: такий пункт точно хибний.
Пункт, що не збігся ні з чим, це «нерозмічений»: він може бути і хибним, і новою реальною проблемою,
тому хибних показуємо двома числами: точно хибні й верхня межа разом із нерозміченими.
"""

from __future__ import annotations

LINE_MARGIN = 5  # модель і людина часто вказують сусідні рядки того самого блоку


def matches(finding: dict, label: dict) -> bool:
    """Той самий файл і або поруч за рядком, або в тексті є ключове слово мітки.

    Для реальної проблеми з ключовими словами сусіднього рядка мало: модель часто пише інше твердження про той самий
    блок коду, і за рядком воно зараховувалось як знахідка (12 із 13 збігів у перших прогонах були саме такими)."""
    if finding.get("file") != label.get("file"):
        return False
    if label.get("real") is True and label.get("keywords"):
        text = f"{finding.get('title', '')} {finding.get('problem', '')}".lower()
        return any(k.lower() in text for k in label["keywords"])
    start, end = (label.get("lines") or [0, 0])[:2]
    if start and start - LINE_MARGIN <= int(finding.get("line") or 0) <= end + LINE_MARGIN:
        return True
    text = f"{finding.get('title', '')} {finding.get('problem', '')}".lower()
    return any(k.lower() in text for k in label.get("keywords") or [])


def score_case(case: dict, report: dict) -> dict:
    real = [i for i in case.get("issues", []) if i.get("real") is True]
    pending = [i for i in case.get("issues", []) if i.get("real") is None]
    # real=false це теж людський вердикт: такий пункт точно хибний, а не нерозмічений
    known_false = [*case.get("known_false", []), *(i for i in case.get("issues", []) if i.get("real") is False)]
    found: set[str] = set()
    false_known: list[dict] = []
    unlabeled: list[dict] = []
    for f in report.get("findings", []):
        hits = [i["id"] for i in real if matches(f, i)]
        if hits:
            found.update(hits)  # кілька пунктів про одну проблему це не хибні пункти
        elif any(matches(f, k) for k in known_false):
            false_known.append(f)
        elif not any(matches(f, i) for i in pending):
            unlabeled.append(f)
    killed = {i["id"] for i in real for r in report.get("rejected", [])
              if i["id"] not in found and matches(r, i)}
    files = int(report.get("files_total") or 0)
    missing = len(report.get("not_reviewed") or [])
    return {
        "pr": case["pr"], "real_total": len(real), "found": sorted(found), "killed": sorted(killed),
        "false_known": len(false_known), "unlabeled": len(unlabeled), "unlabeled_items": unlabeled,
        "findings": len(report.get("findings", [])), "files_total": files, "not_reviewed": missing,
        "failed": bool(report.get("error")),
    }


def aggregate(scored: list[dict]) -> dict:
    """Підсумок одного прогону всіх кейсів."""
    real = sum(s["real_total"] for s in scored)
    found = sum(len(s["found"]) for s in scored)
    files = sum(s["files_total"] for s in scored)
    return {
        "cases": len(scored), "real_total": real, "found": found, "recall": found / real if real else 0.0,
        "killed": sum(len(s["killed"]) for s in scored), "false_known": sum(s["false_known"] for s in scored),
        "false_upper": sum(s["false_known"] + s["unlabeled"] for s in scored),
        "findings": sum(s["findings"] for s in scored),
        "not_reviewed_share": sum(s["not_reviewed"] for s in scored) / files if files else 0.0,
        "failed_cases": sum(s["failed"] for s in scored),
    }


METRICS = ("found", "false_known", "false_upper", "not_reviewed_share", "seconds_max", "cost_usd")
# Для кожної метрики: чи краще, коли більше
HIGHER_IS_BETTER = {"found": True, "false_known": False, "false_upper": False, "not_reviewed_share": False,
                    "seconds_max": False, "cost_usd": False}


def summarize_runs(runs: list[dict]) -> dict:
    """Середнє й розкид кількох прогонів: модель недетермінована, один запуск нічого не доводить."""
    out: dict = {"runs": len(runs)}
    for key in METRICS:
        values = [float(r.get(key) or 0) for r in runs]
        out[key] = {"mean": sum(values) / len(values) if values else 0.0,
                    "min": min(values, default=0.0), "max": max(values, default=0.0)}
    return out


def compare(base: dict, new: dict, seconds_limit: float = 420.0) -> dict:
    """Чи лишати зміну: кожна метрика не гірша за базу з поправкою на її розкид, і час у межах бюджету."""
    worse: list[str] = []
    for key in METRICS:
        if key in ("seconds_max", "cost_usd"):
            continue  # час судимо за лімітом, витрати не вирішальні
        b, n = base[key], new[key]
        spread = (b["max"] - b["min"]) / 2
        delta = n["mean"] - b["mean"]
        if (delta < -spread) if HIGHER_IS_BETTER[key] else (delta > spread):
            worse.append(key)
    if new["seconds_max"]["max"] > seconds_limit:
        worse.append("seconds_max")
    return {"keep": not worse, "worse": worse}
