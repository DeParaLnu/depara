#!/usr/bin/env python3
"""Правила без моделі на diff\'ах PR: без ключа й без мережі. Показує кожне спрацювання, щоб оцінити хибні.

  python3 tools/ai-review/eval/check_rules.py                 # кейси eval
  python3 tools/ai-review/eval/check_rules.py каталог/з/diff  # будь-які файли *.diff (напр. gh pr diff N > N.diff)

Для кейсів eval код і спеки беруться зі знімка коміту PR (якщо він уже є в .cache після прогону run_eval),
для інших diff з поточного робочого каталогу: там правило про спеку лише наближене.
"""

from __future__ import annotations

import sys
import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import checks  # noqa: E402
import review  # noqa: E402


def main(argv: list[str]) -> int:
    folder = Path(argv[0]) if argv else HERE / "cases"
    totals: Counter = Counter()
    paths = sorted(folder.glob("*.diff"))
    for path in paths:
        by_path = dict(review.split_diff(path.read_text("utf-8", "replace")))
        root = HERE.parents[2]
        meta = path.with_suffix(".json")
        if meta.is_file():
            snap = HERE / ".cache" / json.loads(meta.read_text("utf-8")).get("head", "")
            root = snap if snap.is_dir() and any(snap.iterdir()) else root
        tools = review.RepoTools(root)
        for f in checks.run(review.changed_lines(by_path), tools.read_text, review.specs_text(tools), review.backend_text(tools)):
            totals[f["rule"]] += 1
            print(f"{path.stem} {f['rule']} {f['severity']} {f['file']}:{f['line']} | {f['title']} | {f['evidence'][:100]}")
    print(f"Файлів diff: {len(paths)}. Спрацювань: {dict(totals) or 0}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
