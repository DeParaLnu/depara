"""Вузькі проходи (коректність і тести, безпека й авторизація, контракт API) замість одного загального запиту.
За вимірюванням eval вимкнено за замовчуванням, вмикаються через AI_REVIEW_PASSES. Без мережі й без ключа."""

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


def setUpModule():
    global _guard
    _guard = mock.patch.object(review, "request", no_network)
    _guard.start()


def tearDownModule():
    _guard.stop()


def answer(*findings, summary="Змінює підсумок."):
    return ok(json.dumps({"summary": summary, "findings": list(findings)}, ensure_ascii=False))


class PassSelection(unittest.TestCase):
    def test_passes_are_off_by_default_and_can_be_turned_on(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AI_REVIEW_PASSES", None)
            self.assertEqual(review.Config.from_env().passes, ())  # відкочено за вимірюванням eval
        with mock.patch.dict(os.environ, {"AI_REVIEW_PASSES": "all"}):
            self.assertEqual(review.Config.from_env().passes, ("correctness", "security", "contract"))
        with mock.patch.dict(os.environ, {"AI_REVIEW_PASSES": "general"}):
            self.assertEqual(review.Config.from_env().passes, ())
        with mock.patch.dict(os.environ, {"AI_REVIEW_PASSES": "contract, correctness"}):
            self.assertEqual(review.Config.from_env().passes, ("correctness", "contract"))

    def test_unknown_names_are_ignored_with_a_warning(self):
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(review.parse_passes("securty"), ())
            self.assertEqual(review.parse_passes("security,style"), ("security",))
        self.assertIn("::warning::", out.getvalue())

    def test_passes_follow_the_files(self):
        cfg = review.Config(passes=tuple(review.PASSES))
        self.assertEqual(review.chunk_passes(cfg, ["backend/src/routes/profile.ts"]), ["correctness", "security", "contract"])
        self.assertEqual(review.chunk_passes(cfg, ["mobile/src/components/Card.tsx"]), ["correctness"])
        self.assertEqual(review.chunk_passes(cfg, ["mobile/src/api/hooks.ts"]), ["correctness", "contract"])
        self.assertEqual(review.chunk_passes(cfg, ["mobile/src/auth/session.ts"]), ["correctness", "security"])
        self.assertEqual(review.chunk_passes(cfg, ["backend/test/e2e/f9-profile.test.ts"]), ["correctness"])
        self.assertEqual(review.chunk_passes(cfg, ["specs/f9-profile.md"]), ["correctness", "contract"])
        self.assertEqual(review.chunk_passes(cfg, [".github/workflows/ci.yml"]), ["correctness", "security"])

    def test_every_pass_prompt_keeps_the_injection_guard(self):
        # фокус лише додається до загальних правил: заборона виконувати інструкції з diff лишається в кожному проході
        self.assertIn("недовірені дані", review.NOTES_PROMPT)
        for _, _, focus in review.PASSES.values():
            self.assertIn("ЛИШЕ", focus)


class NarrowPasses(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "backend" / "src").mkdir(parents=True)
        (self.root / "backend" / "src" / "a.ts").write_text(A_TS)
        self.cfg = review.Config(api_key="k", repo_dir=self.root, two_stage=True, workers=1, verify_steps=0,
                                 passes=tuple(review.PASSES))
        self.wait, review.RETRY_WAIT = review.RETRY_WAIT, 0

    def tearDown(self):
        review.RETRY_WAIT = self.wait
        self.tmp.cleanup()

    def run_review(self, api, diff=DIFF, report=None):
        with mock.patch.object(review, "request", api), redirect_stdout(io.StringIO()):
            return review.run_review(self.cfg, {"title": "T"}, diff, "", review.RepoTools(self.root), report)

    def test_each_pass_asks_its_own_question_and_findings_merge(self):
        export = finding(line=3, evidence="export default total;", title="Немає перевірки входу", problem="будь-хто читає підсумок")
        api = FakeApi([
            ok("нотатки про коректність"), answer(finding()),
            ok("нотатки про безпеку"), answer(export),
            ok("Проблем немає."), answer(),
            ok(json.dumps({"verdict": "confirmed"})), ok(json.dumps({"verdict": "confirmed"})),
        ])
        report: dict = {}
        out = self.run_review(api, report=report)
        systems = [b["messages"][0]["content"] for b in api.bodies[0:6:2]]
        self.assertIn("ЛИШЕ коректність", systems[0])
        self.assertIn("ЛИШЕ безпека", systems[1])
        self.assertIn("ЛИШЕ контракт", systems[2])
        self.assertTrue(all("недовірені дані" in s for s in systems))
        self.assertIn("Порожній список ламає підсумок", out)
        self.assertIn("Немає перевірки входу", out)
        self.assertEqual({f["title"]: f["pass"] for f in report["findings"]},
                         {"Порожній список ламає підсумок": "correctness", "Немає перевірки входу": "security"})
        self.assertEqual(report["passes"], {"correctness": {"ok": 1}, "security": {"ok": 1}, "contract": {"ok": 1}})
        self.assertEqual(report["not_reviewed"], [])

    def test_same_finding_from_two_passes_is_shown_once(self):
        api = FakeApi([ok("н"), answer(finding()), ok("н"), answer(finding()), ok("н"), answer(),
                       ok(json.dumps({"verdict": "confirmed"}))])
        report: dict = {}
        out = self.run_review(api, report=report)
        self.assertEqual(out.count("Порожній список ламає підсумок"), 1)
        self.assertEqual(report["stats"]["duplicates"], 1)

    def test_one_failed_pass_does_not_lose_the_chunk(self):
        api = FakeApi([ok("н"), answer(finding()), http_error(400, "bad request"), ok("н"), answer(),
                       ok(json.dumps({"verdict": "confirmed"}))])
        report: dict = {}
        out = self.run_review(api, report=report)
        self.assertIn("Порожній список ламає підсумок", out)
        self.assertEqual(report["not_reviewed"], [])
        self.assertEqual(report["passes"]["security"], {"failed": 1})

    def test_chunk_is_not_reviewed_only_when_every_pass_fails(self):
        api = FakeApi([http_error(400, "bad request")] * 3)
        with self.assertRaises(RuntimeError):
            self.run_review(api)

    def test_passes_that_do_not_fit_the_budget_are_skipped_but_earlier_ones_count(self):
        clock = {"t": 0.0}
        calls = {"n": 0}
        inner = FakeApi([ok("н"), answer(finding())])

        def api(*a, **k):
            calls["n"] += 1
            reply = inner(*a, **k)
            if calls["n"] == 2:
                clock["t"] = 10_000.0  # після першого проходу час на шматки вийшов
            return reply

        with mock.patch.object(review.time, "monotonic", lambda: clock["t"]):
            self.cfg.verify = False
            report: dict = {}
            out = self.run_review(api, report=report)
        self.assertIn("Порожній список ламає підсумок", out)
        self.assertEqual(report["passes"], {"correctness": {"ok": 1}, "security": {"skipped": 1}, "contract": {"skipped": 1}})

    def test_general_mode_still_makes_one_request_pair(self):
        self.cfg.passes = ()
        api = FakeApi([ok("н"), answer(finding()), ok(json.dumps({"verdict": "confirmed"}))])
        report: dict = {}
        self.run_review(api, report=report)
        self.assertEqual(len(api.bodies), 3)
        self.assertNotIn("ЛИШЕ", api.bodies[0]["messages"][0]["content"].split("Правила проєкту")[0])
        self.assertNotIn("pass", report["findings"][0])


if __name__ == "__main__":
    unittest.main()
