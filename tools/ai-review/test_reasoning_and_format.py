"""Міркування вимкнено для Qwen3.5, двоетапна схема (нотатки → JSON за схемою), відкат, якщо API відхиляє
параметр, повтор обрізаного шматка меншими частинами, загальний дедлайн відповіді. Без мережі й без ключа."""

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import review
from fakes import A_TS, DIFF, FakeApi, finding, http_error, no_network, ok

REAL_REQUEST = review.request  # до запобіжника: тест дедлайну перевіряє саме її

def setUpModule():
    """Запобіжник: запит без підставного API падає одразу, а не йде в Together."""
    global _guard
    _guard = mock.patch.object(review, "request", no_network)
    _guard.start()


def tearDownModule():
    _guard.stop()


class ReasoningDefault(unittest.TestCase):
    def config(self, **env):
        with mock.patch.dict(os.environ, env, clear=False):
            for name in ("AI_REVIEW_EXTRA_BODY", "TOGETHER_MODEL"):
                if name not in env:
                    os.environ.pop(name, None)
            return review.Config.from_env()

    def test_qwen35_has_reasoning_off_by_default(self):
        self.assertEqual(self.config().extra_body, {"reasoning": {"enabled": False}})
        self.assertEqual(self.config(TOGETHER_MODEL="Qwen/Qwen3.5-27B").extra_body, {"reasoning": {"enabled": False}})

    def test_other_models_get_nothing(self):
        self.assertEqual(self.config(TOGETHER_MODEL="meta-llama/Llama-3.3-70B-Instruct-Turbo").extra_body, {})

    def test_explicit_value_wins_even_empty(self):
        self.assertEqual(self.config(AI_REVIEW_EXTRA_BODY="{}").extra_body, {})
        self.assertEqual(self.config(AI_REVIEW_EXTRA_BODY='{"top_p": 0.9}').extra_body, {"top_p": 0.9})

    def test_two_stage_is_on_by_default_and_can_be_turned_off(self):
        self.assertTrue(self.config().two_stage)
        self.assertFalse(self.config(AI_REVIEW_TWO_STAGE="0").two_stage)


class RejectedParameters(unittest.TestCase):
    def setUp(self):
        self.cfg = review.Config(api_key="k", extra_body={"reasoning": {"enabled": False}})
        self.wait, review.RETRY_WAIT = review.RETRY_WAIT, 0
        self.out = io.StringIO()

    def tearDown(self):
        review.RETRY_WAIT = self.wait

    def chat(self, api, **kw):
        with mock.patch.object(review, "request", api), redirect_stdout(self.out):
            return review.chat(self.cfg, [{"role": "user", "content": "x"}], None, **kw)

    def test_reasoning_dropped_once_and_remembered(self):
        api = FakeApi([http_error(400, "unknown field reasoning"), ok("a"), ok("b")])
        self.assertEqual(self.chat(api)["content"], "a")
        self.chat(api)
        self.assertIn("reasoning", api.bodies[0])
        self.assertNotIn("reasoning", api.bodies[1])
        self.assertNotIn("reasoning", api.bodies[2])  # наступні запити вже без нього

    def test_rejection_does_not_eat_server_error_retries(self):
        api = FakeApi([http_error(400, "reasoning not supported"), http_error(429, "slow down"),
                       http_error(503, "busy"), ok("готово")])
        self.assertEqual(self.chat(api)["content"], "готово")
        self.assertEqual(len(api.bodies), 4)

    def test_schema_falls_back_to_json_object_then_to_nothing(self):
        schema = {"type": "object"}
        api = FakeApi([http_error(400, "json_schema is not supported"), ok("{}"), ok("{}"),
                       http_error(400, "response_format json_object unsupported"), ok("{}")])
        self.chat(api, schema=schema)
        self.assertEqual(api.bodies[0]["response_format"]["type"], "json_schema")
        self.assertEqual(api.bodies[1]["response_format"], {"type": "json_object"})
        self.chat(api, schema=schema)
        self.assertEqual(api.bodies[2]["response_format"], {"type": "json_object"})  # схему вже не пробуємо
        self.chat(api, schema=schema)
        self.assertNotIn("response_format", api.bodies[4])

    def test_unrelated_client_error_is_not_retried(self):
        api = FakeApi([http_error(400, "messages must not be empty")])
        with self.assertRaises(RuntimeError):
            self.chat(api)
        self.assertEqual(len(api.bodies), 1)

    def test_server_errors_do_not_drop_schema(self):
        api = FakeApi([http_error(500, "json_schema boom")] * 3)
        with self.assertRaises(RuntimeError):
            self.chat(api, schema={"type": "object"})
        self.assertTrue(all(b["response_format"]["type"] == "json_schema" for b in api.bodies))

    def test_truncation_is_marked(self):
        self.assertTrue(self.chat(FakeApi([ok("{", finish="length")]))["_truncated"])
        self.assertNotIn("_truncated", self.chat(FakeApi([ok("{}")])))


class TwoStage(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "backend" / "src").mkdir(parents=True)
        (self.root / "backend" / "src" / "a.ts").write_text(A_TS)
        self.cfg = review.Config(api_key="k", repo_dir=self.root, two_stage=True, workers=1, verify_steps=0)

    def tearDown(self):
        self.tmp.cleanup()

    def run_review(self, api, diff=DIFF, report=None):
        with mock.patch.object(review, "request", api), redirect_stdout(io.StringIO()):
            return review.run_review(self.cfg, {"title": "T"}, diff, "", review.RepoTools(self.root), report)

    def test_notes_with_tools_then_json_by_schema_without_tools(self):
        api = FakeApi([
            ok("backend/src/a.ts:2, «const total = items.length;»: items може бути undefined, important. Змінює підсумок."),
            ok(json.dumps({"summary": "Змінює підсумок.", "findings": [finding()]}, ensure_ascii=False)),
            ok(json.dumps({"verdict": "confirmed"})),
        ])
        out = self.run_review(api)
        notes, fmt = api.bodies[0], api.bodies[1]
        self.assertIn("tools", notes)
        self.assertNotIn("response_format", notes)
        self.assertIn("нотатки", notes["messages"][0]["content"].lower())
        self.assertNotIn("tools", fmt)
        self.assertEqual(fmt["response_format"]["type"], "json_schema")
        self.assertIn("<notes>", fmt["messages"][1]["content"])
        self.assertIn("   2| +const total = items.length;", fmt["messages"][1]["content"])  # для дослівної цитати
        self.assertIn("недовірені", fmt["messages"][0]["content"])
        self.assertIn("Порожній список ламає підсумок", out)

    def test_project_rules_reach_the_notes_stage(self):
        rules = self.root / "rules.md"
        rules.write_text("ПРАВИЛО-ПРОЄКТУ")
        self.cfg.rules_path = rules
        api = FakeApi([ok("Проблем немає. Змінює підсумок."), ok(json.dumps({"summary": "s", "findings": []}))])
        self.run_review(api)
        self.assertIn("ПРАВИЛО-ПРОЄКТУ", api.bodies[0]["messages"][0]["content"])

    def test_truncated_chunk_is_retried_in_smaller_parts(self):
        big = DIFF + "diff --git a/backend/src/b.ts b/backend/src/b.ts\n--- a/backend/src/b.ts\n+++ b/backend/src/b.ts\n" \
                     "@@ -1 +1,2 @@\n const b = 1;\n+export const c = b + 1;\n"
        (self.root / "backend" / "src" / "b.ts").write_text("const b = 1;\nexport const c = b + 1;\n")
        api = FakeApi([
            ok("", finish="length"),  # цілий шматок: міркування зʼїли ліміт
            ok("a.ts без проблем."), ok(json.dumps({"summary": "Перша частина.", "findings": []})),
            ok("b.ts: c рахується неправильно."),
            ok(json.dumps({"summary": "Друга частина.", "findings": [
                finding(file="backend/src/b.ts", evidence="export const c = b + 1;", title="Неправильний підсумок c")]},
                ensure_ascii=False)),
            ok(json.dumps({"verdict": "confirmed"})),
        ])
        report: dict = {}
        out = self.run_review(api, big, report)
        self.assertIn("Неправильний підсумок c", out)
        self.assertIn("Переглянуто всі файли: 2.", out)
        self.assertEqual(report["not_reviewed"], [])
        self.assertEqual(report["retried"], [2])

    def test_truncation_that_persists_is_explained(self):
        api = FakeApi([ok("", finish="length")])
        with self.assertRaises(RuntimeError), mock.patch.object(review, "request", api), redirect_stdout(io.StringIO()):
            # один файл, один блок змін: ділити нічого, а пунктів немає зовсім
            review.run_review(self.cfg, {"title": "T"}, DIFF, "", review.RepoTools(self.root), {})

    def test_reason_in_comment_when_one_part_stays_truncated(self):
        big = DIFF + "diff --git a/backend/src/b.ts b/backend/src/b.ts\n--- a/backend/src/b.ts\n+++ b/backend/src/b.ts\n" \
                     "@@ -1 +1 @@\n+const b = 2;\n"
        self.cfg.chunk_chars = 260  # кожен файл окремим шматком
        api = FakeApi([
            ok("a.ts без проблем."), ok(json.dumps({"summary": "Перша частина.", "findings": []})),
            ok("", finish="length"),
        ])
        out = self.run_review(api, big)
        self.assertIn("- **Відповідь моделі обрізано** (1): `backend/src/b.ts`", out)
        self.assertIn("AI_REVIEW_MAX_TOKENS", out)

    def test_empty_notes_are_not_a_crash(self):
        api = FakeApi([ok("")])
        with mock.patch.object(review, "request", api):
            out = review.review_chunk_two_stage(self.cfg, "u", review.RepoTools(self.root), None, "", set(), {})
        self.assertEqual(out, {"_truncated": False})
        self.assertEqual(len(api.bodies), 1)  # без нотаток другий етап не запускається


class Halving(unittest.TestCase):
    def test_two_files_go_to_different_halves(self):
        files = [("a.ts", "diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n" + "+a\n" * 50),
                 ("b.ts", "diff --git a/b.ts b/b.ts\n@@ -1 +1 @@\n" + "+b\n" * 50)]
        halves = review.halve(files, 4000)
        self.assertEqual([[p for p, _ in h] for h in halves], [["a.ts"], ["b.ts"]])

    def test_single_hunk_cannot_be_halved(self):
        files = [("a.ts", "diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n+a\n")]
        self.assertEqual(review.halve(files, 4000), [files])


class Deadline(unittest.TestCase):
    def test_slow_trickle_stops_at_deadline(self):
        clock = {"t": 0.0}

        class Trickle:
            length = None  # без Content-Length: кінець невідомий

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self, n):
                clock["t"] += 10  # кожен байт приходить через 10 с
                return b" "

            headers = {}

        with mock.patch.object(review.urllib.request, "urlopen", lambda *a, **k: Trickle()), \
                mock.patch.object(review.time, "monotonic", lambda: clock["t"]):
            with self.assertRaisesRegex(RuntimeError, "не прийшла вчасно"):
                REAL_REQUEST("POST", "https://x/v1/chat/completions", {}, {}, timeout=5, deadline=30)


if __name__ == "__main__":
    unittest.main()
