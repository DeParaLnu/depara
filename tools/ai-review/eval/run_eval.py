#!/usr/bin/env python3
"""Прогін ШІ-ревʼюера на розмічених PR і підрахунок метрик. Нічого не публікує.

  python3 tools/ai-review/eval/run_eval.py --label base --runs 3
  python3 tools/ai-review/eval/run_eval.py --label reasoning-off --smoke
  python3 tools/ai-review/eval/run_eval.py --compare base reasoning-off
  python3 tools/ai-review/eval/run_eval.py --rescore base    # нові мітки без нового платного прогону
  python3 tools/ai-review/eval/run_eval.py --label base --runs 2 --append   # дописати прогони до наявних

Довгі прогони варто запускати під caffeinate -i: Mac, що засинає, лишає запит до моделі висіти.

Ключ береться зі змінної TOGETHER_API_KEY або з кореневого .env основного клона і нікуди не друкується.
Налаштування ревʼюера задаються тими самими змінними AI_REVIEW_*. Подробиці: docs/ai-review.md.
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import subprocess
import sys
import tempfile
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
# $ за 1 млн токенів (вхід, вихід) у каталозі Together. Невідома модель рахується за найдорожчою з відомих,
# щоб межа витрат спрацювала раніше, а не пізніше.
PRICES = {"Qwen/Qwen3.5-9B": (0.17, 0.25), "deepseek-ai/DeepSeek-V4.1-Flash": (0.30, 1.20)}
PRICE_IN, PRICE_OUT = PRICES.get(os.environ.get("TOGETHER_MODEL") or review.Config.model, max(PRICES.values()))
BUDGET_USD = 19.0  # ліміт ключа 20 $: лишаємо запас на прогін, що вже йде
RESERVE_USD = 0.25  # стільки має лишатись до межі, щоб почати ще один кейс
CASE_TIMEOUT = review.Config.budget_seconds + 180  # бюджет ревʼю плюс запас; довше означає, що процес завис
CI_TEXT = "backend-e2e: виконується; backend-lint-typecheck: виконується; mobile-typecheck-test: виконується"


def load_key(env: dict, env_file: Path | None) -> str:
    if env.get("TOGETHER_API_KEY"):
        return env["TOGETHER_API_KEY"]
    if env_file and env_file.is_file():
        for line in env_file.read_text("utf-8").splitlines():
            if line.startswith("TOGETHER_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def use_system_certificates(env: dict) -> None:
    """Python із Homebrew не бачить кореневих сертифікатів macOS. Перевірку TLS не вимикаємо: у запиті йде ключ."""
    if not ssl.get_default_verify_paths().cafile and Path("/etc/ssl/cert.pem").is_file():
        env.setdefault("SSL_CERT_FILE", "/etc/ssl/cert.pem")


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
    if target.is_dir() and any(target.iterdir()):
        return target
    git("fetch", "-q", "origin", f"pull/{case['pr']}/head")
    extract(sha, target)
    return target


def extract(sha: str, target: Path, repo: Path = HERE) -> None:
    """Розпаковує коміт у target. git archive з підкаталогу бере лише цей підкаталог (у старому коміті його може
    не бути, і архів виходить порожнім без помилки), тому запускається з кореня репозиторію, а порожній знімок це збій:
    на порожньому каталозі інструменти моделі нічого не читають, і ревʼю міряється не те."""
    top = Path(git("rev-parse", "--show-toplevel", cwd=repo).stdout.decode().strip())
    target.mkdir(parents=True, exist_ok=True)
    archive = subprocess.Popen(["git", "archive", sha], cwd=top, stdout=subprocess.PIPE)
    subprocess.run(["tar", "-x", "-C", str(target)], stdin=archive.stdout, check=True)
    archive.stdout.close()
    if archive.wait() != 0 or not any(target.iterdir()):
        raise RuntimeError(f"не вдалося дістати коміт {sha}: знімок порожній")


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


def run_case_isolated(case: dict, key: str, timeout: float = CASE_TIMEOUT) -> dict:
    """Кейс в окремому процесі з жорстким лімітом: завислий запит (сон Mac, обірване зʼєднання) не зупиняє весь eval.
    Ключ передається через змінну середовища, не в аргументах: так його не видно в списку процесів."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "report.json"
        env = {**os.environ, "TOGETHER_API_KEY": key}
        try:
            proc = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--one-case", str(case["pr"]), "--out", str(out)],
                                  env=env, timeout=timeout, capture_output=True, check=False)
        except subprocess.TimeoutExpired:
            return {"error": f"завис: ревʼю не завершилось за {timeout:.0f} с", "seconds": timeout, "timed_out": True,
                    "usage": {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "truncated": 0}}
        if not out.is_file():
            tail = scrub((proc.stderr or b"").decode("utf-8", "replace").strip(), key)[-300:]
            return {"error": f"процес ревʼю впав без звіту: {tail}", "seconds": 0.0,
                    "usage": {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "truncated": 0}}
        return json.loads(out.read_text("utf-8"))


def run_once(cases: list[dict], key: str, rules: Path, spend: Spend, jobs: int) -> tuple[dict, list[dict], bool]:
    stopped = threading.Event()

    def one(case: dict) -> tuple[dict, dict] | None:
        if not spend.can_start():
            stopped.set()
            return None
        report = run_case_isolated(case, key)
        # у вбитого процесу витрат не видно: рахуємо запас, щоб межа 20 $ не пливла
        spend.add(RESERVE_USD if report.get("timed_out") else cost(report["usage"]))
        return case, report

    with ThreadPoolExecutor(max_workers=jobs) as pool:
        done = [r for r in pool.map(one, cases) if r]
    summary, scored = score_reports(done)
    return summary, scored, stopped.is_set()


def score_reports(done: list[tuple[dict, dict]]) -> tuple[dict, list[dict]]:
    """Метрики зі звітів. Звіт зберігається цілком: мітки можна змінити й перерахувати без нових запитів."""
    scored = []
    for case, report in done:
        s = score.score_case(case, report)
        s.update(seconds=report["seconds"], usage=report["usage"], error=report.get("error", ""), report=report)
        scored.append(s)
    summary = score.aggregate(scored)
    summary["seconds_max"] = max((s["seconds"] for s in scored), default=0.0)
    summary["seconds_total"] = round(sum(s["seconds"] for s in scored), 1)
    summary["cost_usd"] = round(sum(cost(s["usage"]) for s in scored), 4)
    summary["truncated"] = sum(s["usage"]["truncated"] for s in scored)
    return summary, scored


def rescore(label: str) -> int:
    """Перераховує прогін за поточними мітками: жодного запиту до моделі."""
    paths = sorted((RESULTS / "raw").glob(f"{label}-*.json"), key=lambda p: int(p.stem.rsplit("-", 1)[1]))
    if not paths:
        print(f"Немає збережених звітів прогону {label}.", file=sys.stderr)
        return 2
    cases = {c["pr"]: c for c in load_cases(None, False, None)}
    runs = []
    for i, path in enumerate(paths, 1):
        done = [(cases[s["pr"]], s["report"]) for s in json.loads(path.read_text("utf-8")) if s["pr"] in cases]
        summary, scored = score_reports(done)
        runs.append(summary)
        path.write_text(json.dumps(scored, ensure_ascii=False, indent=1), "utf-8")
        print(line(f"прогін {i}", summary))
    target = RESULTS / f"{label}.json"
    result = json.loads(target.read_text("utf-8")) if target.is_file() else {"label": label}
    result.update(runs=runs, summary=score.summarize_runs(runs))
    target.write_text(json.dumps(result, ensure_ascii=False, indent=1), "utf-8")
    return 0


def next_run_number(raw_dir: Path, label: str) -> int:
    """Наступний номер прогону: найбільший наявний плюс один, а не кількість файлів.
    Після видалення зіпсованого прогону рахунок файлів затер би наступний збережений."""
    numbers = [int(p.stem.rsplit("-", 1)[1]) for p in raw_dir.glob(f"{label}-*.json") if p.stem.rsplit("-", 1)[1].isdigit()]
    return max(numbers, default=0) + 1


def scrub(text: str, key: str) -> str:
    """Захист від випадкового потрапляння ключа у файли результатів, наприклад через текст помилки."""
    return text.replace(key, "***") if key else text


def line(name: str, s: dict) -> str:
    return (f"{name:<14} знайдено {s['found']}/{s['real_total']}, відкинуто реальних {s['killed']}, "
            f"хибних {s['false_known']}..{s['false_upper']}, від правил {s.get('static', 0)}, не переглянуто {s['not_reviewed_share']:.0%}, "
            f"найдовше {s['seconds_max']:.0f} с, обрізань {s['truncated']}, {s['cost_usd']:.2f} $")


def show_compare(base_label: str, new_label: str) -> int:
    summaries = []
    for label in (base_label, new_label):
        path = RESULTS / f"{label}.json"
        try:
            summaries.append(json.loads(path.read_text("utf-8"))["summary"])
        except (OSError, ValueError, KeyError):
            print(f"Немає результатів прогону «{label}» ({path.name}): спершу запустіть його з --label {label}.", file=sys.stderr)
            return 2
    base, new = summaries
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
    parser.add_argument("--rescore", metavar="НАЗВА", help="перерахувати збережений прогін за поточними мітками")
    parser.add_argument("--append", action="store_true", help="дописати прогони до вже збережених під цією назвою")
    parser.add_argument("--one-case", type=int, help=argparse.SUPPRESS)  # внутрішнє: один кейс в окремому процесі
    parser.add_argument("--out", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.compare:
        return show_compare(*args.compare)
    if args.rescore:
        return rescore(args.rescore)
    env = os.environ if env is None else env
    if args.one_case:  # до перевірки --label: дочірній процес його не отримує
        use_system_certificates(os.environ)
        key = env.get("TOGETHER_API_KEY", "")
        case = next(c for c in load_cases({args.one_case}, False, None))
        report = run_case(case, key, HERE.parent / "rules.md")
        Path(args.out).write_text(scrub(json.dumps(report, ensure_ascii=False), key), "utf-8")
        return 0
    if not args.label:
        parser.error("потрібен --label або --compare")

    key = load_key(env, main_env_file())
    if not key:
        print("TOGETHER_API_KEY не задано: додайте його в кореневий .env або в змінну середовища.", file=sys.stderr)
        return 2
    use_system_certificates(os.environ)
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
    first = next_run_number(raw_dir, args.label) if args.append else 1
    for i in range(first, first + args.runs):
        summary, scored, stopped = run_once(cases, key, rules, spend, args.jobs)
        runs.append(summary)
        (raw_dir / f"{args.label}-{i}.json").write_text(
            scrub(json.dumps(scored, ensure_ascii=False, indent=1), key), "utf-8")
        print(line(f"прогін {i}", summary))
        for s in scored:
            if s["error"]:
                print(f"  збій #{s['pr']}: {scrub(s['error'], key)[:120]}; {scrub('; '.join(s['report'].get('notes') or []), key)[:200]}")
            for item in s["unlabeled_items"]:
                print(f"  нерозмічено #{s['pr']} {item['file']}:{item['line']} {item['title'][:70]}")
        if stopped:
            print(f"Зупинено: витрати {spend.total:.2f} $ біля межі {args.budget_usd:.2f} $.")
            break
    RESULTS.mkdir(exist_ok=True)
    result = {"label": args.label, "smoke": args.smoke, "set": args.set, "cases": [c["pr"] for c in cases],
              "runs": runs, "summary": score.summarize_runs(runs), "partial": stopped}
    (RESULTS / f"{args.label}.json").write_text(scrub(json.dumps(result, ensure_ascii=False, indent=1), key), "utf-8")
    if args.append:
        rescore(args.label)  # підсумок за всіма прогонами під цією назвою, а не лише за дописаними
    print(f"Усього витрачено: {spend.total:.2f} $ із {args.budget_usd:.2f} $.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
