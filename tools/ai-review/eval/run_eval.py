#!/usr/bin/env python3
"""Прогін ШІ-ревʼюера на розмічених PR і підрахунок метрик. Нічого не публікує.

  python3 tools/ai-review/eval/run_eval.py --label base --runs 3
  python3 tools/ai-review/eval/run_eval.py --label reasoning-off --smoke
  python3 tools/ai-review/eval/run_eval.py --compare base reasoning-off

Ключ береться зі змінної TOGETHER_API_KEY або з кореневого .env основного клона і нікуди не друкується.
Налаштування ревʼюера задаються тими самими змінними AI_REVIEW_*. Подробиці: docs/ai-review.md.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import review  # noqa: E402
import score  # noqa: E402

CASES = HERE / "cases"
RESULTS = HERE / "results"
CACHE = HERE / ".cache"
PRICE_IN, PRICE_OUT = 0.17, 0.25  # $ за 1 млн токенів, Qwen/Qwen3.5-9B у каталозі Together
BUDGET_USD = 19.0  # ліміт ключа 20 $: лишаємо запас на прогін, що вже йде
RESERVE_USD = 0.25  # стільки має лишатись до межі, щоб почати ще один кейс
CI_TEXT = "backend-e2e: виконується; backend-lint-typecheck: виконується; mobile-typecheck-test: виконується"


def load_key(env: dict, env_file: Path | None) -> str:
    if env.get("TOGETHER_API_KEY"):
        return env["TOGETHER_API_KEY"]
    if env_file and env_file.is_file():
        for line in env_file.read_text("utf-8").splitlines():
            if line.startswith("TOGETHER_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def git(*args: str, cwd: Path = HERE, **kw) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, **kw)


def main_env_file() -> Path:
    """Кореневий .env основного клона: worktree має свій робочий каталог, а .env лежить там."""
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir").stdout.decode().strip()
    return Path(common).parent / ".env"


def snapshot(case: dict) -> Path:
    """Код на момент ревʼю: багато проблем виправляли до злиття, у фінальному коміті їх уже немає."""
    sha = case["head"]
    target = CACHE / sha
    if target.is_dir():
        return target
    git("fetch", "-q", "origin", f"pull/{case['pr']}/head")
    target.mkdir(parents=True)
    archive = subprocess.Popen(["git", "archive", sha], cwd=HERE, stdout=subprocess.PIPE)
    subprocess.run(["tar", "-x", "-C", str(target)], stdin=archive.stdout, check=True)
    archive.stdout.close()
    if archive.wait() != 0:
        raise RuntimeError(f"не вдалося дістати коміт {sha}")
    return target


class Spend:
    """Облік витрат між запусками: сума лежить у файлі, тож межа діє на весь експеримент, а не на один прогін."""

    def __init__(self, path: Path, limit: float):
        self.path, self.limit, self.lock = path, limit, threading.Lock()
        self.total = json.loads(path.read_text())["usd"] if path.is_file() else 0.0

    def can_start(self) -> bool:
        with self.lock:
            return self.total + RESERVE_USD <= self.limit

    def add(self, usd: float) -> None:
        with self.lock:
            self.total += usd
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps({"usd": round(self.total, 4)}))


def cost(usage: dict) -> float:
    return (usage["prompt_tokens"] * PRICE_IN + usage["completion_tokens"] * PRICE_OUT) / 1_000_000


def load_cases(only: set[int] | None, smoke: bool, subset: str | None) -> list[dict]:
    cases = [json.loads(p.read_text("utf-8")) for p in sorted(CASES.glob("pr-*.json"))]
    return [c for c in cases if (not only or c["pr"] in only) and (not smoke or c.get("smoke"))
            and (not subset or c.get("set") == subset)]


def run_case(case: dict, key: str, rules: Path) -> dict:
    """Один PR, повний конвеєр ревʼю без публікації. Збій ревʼю це теж результат, а не падіння eval."""
    cfg = review.Config.from_env()
    cfg.api_key, cfg.dry_run, cfg.rules_path = key, True, rules
    cfg.repo_dir = snapshot(case)
    cfg.usage = review.Usage()
    pr = {"title": case["title"], "body": case.get("body", ""),
          "head": {"ref": case.get("head_ref", "feature")}, "base": {"ref": case.get("base_ref", "develop")}}
    diff = (CASES / f"pr-{case['pr']}.diff").read_text("utf-8")
    report: dict = {}
    started = time.monotonic()
    try:
        review.run_review(cfg, pr, diff, CI_TEXT, review.RepoTools(cfg.repo_dir), report)
    except (RuntimeError, KeyError, ValueError) as err:
        report["error"] = str(err)
    report["seconds"] = round(time.monotonic() - started, 1)
    report["usage"] = cfg.usage.as_dict()
    return report


def run_once(cases: list[dict], key: str, rules: Path, spend: Spend, jobs: int) -> tuple[dict, list[dict], bool]:
    stopped = threading.Event()

    def one(case: dict) -> tuple[dict, dict] | None:
        if not spend.can_start():
            stopped.set()
            return None
        report = run_case(case, key, rules)
        spend.add(cost(report["usage"]))
        return case, report

    with ThreadPoolExecutor(max_workers=jobs) as pool:
        done = [r for r in pool.map(one, cases) if r]
    scored = []
    for case, report in done:
        s = score.score_case(case, report)
        s.update(seconds=report["seconds"], usage=report["usage"], error=report.get("error", ""),
                 rejected=report.get("rejected", []), notes=report.get("notes", []))
        scored.append(s)
    summary = score.aggregate(scored)
    summary["seconds_max"] = max((s["seconds"] for s in scored), default=0.0)
    summary["seconds_total"] = round(sum(s["seconds"] for s in scored), 1)
    summary["cost_usd"] = round(sum(cost(s["usage"]) for s in scored), 4)
    summary["truncated"] = sum(s["usage"]["truncated"] for s in scored)
    return summary, scored, stopped.is_set()


def scrub(text: str, key: str) -> str:
    """Захист від випадкового потрапляння ключа у файли результатів, наприклад через текст помилки."""
    return text.replace(key, "***") if key else text


def line(name: str, s: dict) -> str:
    return (f"{name:<14} знайдено {s['found']}/{s['real_total']}, відкинуто реальних {s['killed']}, "
            f"хибних {s['false_known']}..{s['false_upper']}, не переглянуто {s['not_reviewed_share']:.0%}, "
            f"найдовше {s['seconds_max']:.0f} с, обрізань {s['truncated']}, {s['cost_usd']:.2f} $")


def show_compare(base_label: str, new_label: str) -> int:
    base = json.loads((RESULTS / f"{base_label}.json").read_text("utf-8"))["summary"]
    new = json.loads((RESULTS / f"{new_label}.json").read_text("utf-8"))["summary"]
    for key in score.METRICS:
        b, n = base[key], new[key]
        print(f"{key:<20} {b['mean']:>8.2f} [{b['min']:.2f}..{b['max']:.2f}]  →  {n['mean']:>8.2f} [{n['min']:.2f}..{n['max']:.2f}]")
    verdict = score.compare(base, new)
    print("Рішення:", "лишаємо" if verdict["keep"] else f"гірше за базою: {', '.join(verdict['worse'])}")
    return 0


def main(argv: list[str] | None = None, env: dict | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--label", help="назва прогону, під нею лягає результат")
    parser.add_argument("--runs", type=int, default=1, help="скільки разів повторити (модель недетермінована)")
    parser.add_argument("--smoke", action="store_true", help="лише короткий набір кейсів")
    parser.add_argument("--set", choices=("dev", "holdout"), help="лише цей набір")
    parser.add_argument("--cases", help="номери PR через кому")
    parser.add_argument("--jobs", type=int, default=2, help="скільки PR одночасно")
    parser.add_argument("--budget-usd", type=float, default=BUDGET_USD)
    parser.add_argument("--compare", nargs=2, metavar=("БАЗА", "НОВЕ"))
    args = parser.parse_args(argv)
    if args.compare:
        return show_compare(*args.compare)
    if not args.label:
        parser.error("потрібен --label або --compare")

    env = os.environ if env is None else env
    key = load_key(env, main_env_file())
    if not key:
        print("TOGETHER_API_KEY не задано: додайте його в кореневий .env або в змінну середовища.", file=sys.stderr)
        return 2
    only = {int(x) for x in args.cases.split(",")} if args.cases else None
    cases = load_cases(only, args.smoke, args.set)
    if not cases:
        print("Немає кейсів за цим відбором.", file=sys.stderr)
        return 2
    spend = Spend(RESULTS / "spend.json", args.budget_usd)
    rules = HERE.parent / "rules.md"
    runs, raw_dir = [], RESULTS / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    stopped = False
    for i in range(1, args.runs + 1):
        summary, scored, stopped = run_once(cases, key, rules, spend, args.jobs)
        runs.append(summary)
        (raw_dir / f"{args.label}-{i}.json").write_text(
            scrub(json.dumps(scored, ensure_ascii=False, indent=1), key), "utf-8")
        print(line(f"прогін {i}", summary))
        for s in scored:
            for item in s["unlabeled_items"]:
                print(f"  нерозмічено #{s['pr']} {item['file']}:{item['line']} {item['title'][:70]}")
        if stopped:
            print(f"Зупинено: витрати {spend.total:.2f} $ біля межі {args.budget_usd:.2f} $.")
            break
    RESULTS.mkdir(exist_ok=True)
    result = {"label": args.label, "smoke": args.smoke, "set": args.set, "cases": [c["pr"] for c in cases],
              "runs": runs, "summary": score.summarize_runs(runs), "partial": stopped}
    (RESULTS / f"{args.label}.json").write_text(scrub(json.dumps(result, ensure_ascii=False, indent=1), key), "utf-8")
    print(f"Усього витрачено: {spend.total:.2f} $ із {args.budget_usd:.2f} $.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
