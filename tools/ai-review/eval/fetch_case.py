#!/usr/bin/env python3
"""Зберігає diff кейса: python3 tools/ai-review/eval/fetch_case.py 86 90 (без номерів: усі кейси).

Diff береться локальним git між base і head із файла кейса: це стан на момент ревʼю, а не фінальний PR."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

CASES = Path(__file__).resolve().parent / "cases"


def fetch(path: Path) -> None:
    case = json.loads(path.read_text("utf-8"))
    run = lambda *a: subprocess.run(["git", *a], cwd=CASES, check=True, capture_output=True).stdout  # noqa: E731
    run("fetch", "-q", "origin", f"pull/{case['pr']}/head")
    diff = run("diff", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/",
               f"{case['base']}...{case['head']}")
    path.with_suffix(".diff").write_bytes(diff)
    print(f"#{case['pr']}: {len(diff)} байт")


if __name__ == "__main__":
    wanted = {int(x) for x in sys.argv[1:]}
    for p in sorted(CASES.glob("pr-*.json")):
        if not wanted or json.loads(p.read_text("utf-8"))["pr"] in wanted:
            fetch(p)
