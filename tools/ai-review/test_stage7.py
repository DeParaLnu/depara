"""Етап 7: прозорість коментаря (що не переглянуто і чому) і метрики роботи в журналі. Без мережі й без ключа."""

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import review
from test_stage2 import FakeApi, http_error, no_network, ok
from test_stage4 import diff_of


def setUpModule():
    global _guard
    _guard = mock.patch.object(review, "request", no_network)
    _guard.start()


def tearDownModule():
    _guard.stop()


EMPTY = ok(json.dumps({"summary": "Частина.", "findings": []}))


class Coverage(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.cfg = review.Config(api_key="k", repo_dir=self.root, two_stage=True, workers=1, verify_steps=0, checks=False)
        self.wait, review.RETRY_WAIT = review.RETRY_WAIT, 0

    def tearDown(self):
        review.RETRY_WAIT = self.wait
        self.tmp.cleanup()

    def run_review(self, api, diff, report=None):
        with mock.patch.object(review, "request", api), redirect_stdout(io.StringIO()):
            return review.run_review(self.cfg, {"title": "T"}, diff, "", review.RepoTools(self.root), report)

    def test_everything_reviewed_has_no_warning(self):
        out = self.run_review(FakeApi([ok("Проблем немає."), EMPTY]), diff_of("backend/src/a.ts", ["const a = 1;"]))
        self.assertNotIn("⚠️", out)
        self.assertIn("### Охоплення\nПереглянуто всі файли: 1.", out)
        self.assertIn("Суттєвих проблем не знайдено.", out)

    def test_files_over_the_chunk_limit_are_listed_with_reason_and_advice(self):
        self.cfg.chunk_chars, self.cfg.max_chunks = 200, 1
        diff = diff_of("backend/src/a.ts", ["const a = 1;"]) + diff_of("backend/src/b.ts", ["const b = 2;"]) + \
            diff_of("backend/package-lock.json", ["x"])
        report: dict = {}
        out = self.run_review(FakeApi([ok("Проблем немає."), EMPTY]), diff, report)
        self.assertTrue(out.startswith("> ⚠️ **Переглянуто 1 з 2 файлів.**"))
        self.assertIn("- **Не вмістились у ліміт ревʼю** (1): `backend/src/b.ts`", out)
        self.assertIn("AI_REVIEW_MAX_CHUNKS", out)
        self.assertIn("Службових файлів (лок-файли, зображення) не переглядаємо: 1.", out)
        self.assertIn("У переглянутих файлах суттєвих проблем не знайдено.", out)
        self.assertEqual(report["not_reviewed"], ["backend/src/b.ts"])

    def test_truncated_big_hunk_counts_as_partially_reviewed(self):
        self.cfg.chunk_chars = 400
        out = self.run_review(FakeApi([ok("Проблем немає."), EMPTY]), diff_of("backend/src/big.ts", ["const a = 1; // " + "x" * 30] * 40))
        self.assertIn("> ⚠️ **Переглянуто 1 з 1 файлів (1 частково).**", out)
        self.assertIn("- **Переглянуто лише частково** (1): `backend/src/big.ts`", out)

    def test_request_failure_names_files_and_the_error_once(self):
        self.cfg.chunk_chars = 200
        diff = diff_of("backend/src/a.ts", ["const a = 1;"]) + diff_of("backend/src/b.ts", ["const b = 2;"])
        out = self.run_review(FakeApi([ok("Проблем немає."), EMPTY, http_error(400, "bad request")]), diff)
        self.assertIn("- **Збій запиту до моделі** (1): `backend/src/b.ts`", out)
        self.assertIn("HTTP 400", out)

    def test_mentions_in_file_names_are_defused(self):
        out = self.run_review(FakeApi([ok("н"), EMPTY]), diff_of("a.ts", ["x"]) + diff_of("docs/@team.md", ["y" * 9000]))
        self.assertNotIn("@team", out)


class Metrics(unittest.TestCase):
    REPORT = {
        "files_total": 3, "chunks_total": 2, "chunks_failed": 1, "retried": [2],
        "coverage": {"files_total": 3, "gaps": {**{k: [] for k in review.GAP_REASONS}, "bad_json": ["b.ts"], "partial": ["a.ts"]},
                     "errors": [], "service": 1},
        "stats": {"raw": 5, "no_evidence": 1, "refuted": 2, "duplicates": 1, "over_limit": 0, "unverified": 0},
        "findings": [{"file": "a.ts", "title": "СЕКРЕТНИЙ ТЕКСТ ПУНКТУ"}, {"file": "p.json", "title": "x", "pass": "static", "rule": "dependencies"}],
    }

    def cfg(self):
        cfg = review.Config(api_key="very-secret-key", model="Qwen/Qwen3.5-9B")
        cfg.usage.add({"prompt_tokens": 1000, "completion_tokens": 50}, "length")
        return cfg

    def test_numbers_only(self):
        m = review.review_metrics(self.cfg(), self.REPORT, 12.34)
        self.assertEqual((m["files_total"], m["files_reviewed"], m["files_partial"]), (3, 2, 1))
        self.assertEqual(m["not_reviewed"], {"bad_json": 1})
        self.assertEqual((m["model_findings"], m["shown"], m["rule_findings"]), (5, 1, {"dependencies": 1}))
        self.assertEqual((m["requests"], m["truncated"], m["seconds"]), (1, 1, 12.3))
        dumped = json.dumps(m, ensure_ascii=False)
        self.assertNotIn("very-secret-key", dumped)
        self.assertNotIn("СЕКРЕТНИЙ ТЕКСТ", dumped)  # тексту пунктів і diff у метриках немає

    def test_log_line_json_line_and_step_summary(self):
        out = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            summary = Path(tmp) / "summary.md"
            with mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary)}), redirect_stdout(out):
                review.log_metrics(self.cfg(), self.REPORT, 12.0)
            text = summary.read_text("utf-8")
        log = out.getvalue()
        self.assertIn("Метрики ревʼю: файлів 2/3, шматків 2 (збоїв 1, повторів 1), пунктів від моделі 5, показано 1", log)
        line = next(x for x in log.splitlines() if x.startswith("AI_REVIEW_METRICS "))
        self.assertEqual(json.loads(line.split(" ", 1)[1])["rejected"]["refuted"], 2)
        self.assertIn("| Файлів переглянуто | 2 з 3 (1 частково) |", text)
        self.assertIn("модель не дала придатної відповіді: 1", text)
        self.assertNotIn("very-secret-key", log + text)

    def test_metrics_are_logged_even_when_the_review_fails(self):
        env = {"TOGETHER_API_KEY": "k", "GITHUB_TOKEN": "t", "GITHUB_REPOSITORY": "o/r", "PR_NUMBER": "1"}
        out = io.StringIO()
        with mock.patch.dict(os.environ, env), mock.patch.object(review, "request", side_effect=RuntimeError("GET x → HTTP 500: boom")), \
                redirect_stdout(out):
            os.environ.pop("GITHUB_STEP_SUMMARY", None)
            self.assertEqual(review.main(), 0)  # збій не робить job червоним
        self.assertIn("::warning::ШІ-ревʼю не вдалося", out.getvalue())
        self.assertIn('"failed": "GET x → HTTP 500: boom"', out.getvalue())

    def test_broken_metrics_do_not_fail_the_job(self):
        env = {"TOGETHER_API_KEY": "k", "GITHUB_TOKEN": "t", "GITHUB_REPOSITORY": "o/r", "PR_NUMBER": "1"}
        out = io.StringIO()
        with mock.patch.dict(os.environ, env), mock.patch.object(review, "request", side_effect=RuntimeError("x")), \
                mock.patch.object(review, "review_metrics", side_effect=TypeError("boom")), redirect_stdout(out):
            self.assertEqual(review.main(), 0)
        self.assertIn("Метрики ревʼю не записано", out.getvalue())


if __name__ == "__main__":
    unittest.main()
