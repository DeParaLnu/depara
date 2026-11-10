"""Тести eval без мережі й без ключа: підрахунок метрик, облік витрат, звіт ревʼюера, формат кейсів."""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "eval"))

import review  # noqa: E402
import run_eval  # noqa: E402
import score  # noqa: E402

FAKE_KEY = "fake-key-for-tests"
ISSUE = {"id": "r1", "real": True, "file": "a.ts", "lines": [10, 12], "keywords": []}


def finding(file="a.ts", line=11, title="t", problem="p"):
    return {"file": file, "line": line, "title": title, "problem": problem}


class StaticRules(unittest.TestCase):
    def test_rule_findings_are_counted_apart_from_model_guesses(self):
        case = {"pr": 1, "issues": [ISSUE], "known_false": []}
        report = {"findings": [{"file": "package.json", "line": 3, "title": "Нові залежності: zod", "problem": "", "pass": "static"},
                               {"file": "b.ts", "line": 1, "title": "здогад моделі", "problem": ""}]}
        s = score.score_case(case, report)
        self.assertEqual((s["static"], s["unlabeled"], s["findings"]), (1, 1, 2))
        self.assertEqual(score.aggregate([s])["static"], 1)


class Matching(unittest.TestCase):
    def test_line_nearby_counts(self):
        self.assertTrue(score.matches(finding(line=15), ISSUE))
        self.assertTrue(score.matches(finding(line=5), ISSUE))

    def test_far_line_or_other_file_does_not_count(self):
        self.assertFalse(score.matches(finding(line=40), ISSUE))
        self.assertFalse(score.matches(finding(file="b.ts"), ISSUE))

    def test_keyword_works_without_lines(self):
        real = {**ISSUE, "keywords": ["регістр"]}  # реальна проблема з ключовими словами: сусіднього рядка мало
        self.assertFalse(score.matches(finding(line=11, title="інше твердження про той самий блок"), real))
        self.assertTrue(score.matches(finding(line=400, title="порівняння без урахування регістру"), real))
        label = {"file": "a.ts", "keywords": ["Інвалідац"]}
        self.assertTrue(score.matches(finding(line=400, title="немає інвалідації кешу"), label))
        self.assertFalse(score.matches(finding(line=400, title="інше"), label))


class ScoreCase(unittest.TestCase):
    case = {"pr": 1, "issues": [ISSUE, {"id": "r2", "real": True, "file": "b.ts", "lines": [1, 1]},
                                {"id": "r3", "real": None, "file": "c.ts", "lines": [5, 5]}],
            "known_false": [{"id": "f1", "file": "d.ts", "keywords": ["кеш"]}]}

    def test_found_false_and_unlabeled(self):
        report = {"findings": [finding(), finding(line=12), finding("d.ts", 1, "кеш"), finding("e.ts", 1)],
                  "files_total": 4, "not_reviewed": ["e.ts"]}
        s = score.score_case(self.case, report)
        self.assertEqual(s["found"], ["r1"])  # два пункти про одну проблему це одна знайдена
        self.assertEqual((s["false_known"], s["unlabeled"], s["not_reviewed"]), (1, 1, 1))

    def test_real_issue_killed_by_verification_is_visible(self):
        report = {"findings": [], "rejected": [{**finding("b.ts", 1), "reason": "refuted"}]}
        self.assertEqual(score.score_case(self.case, report)["killed"], ["r2"])

    def test_found_issue_is_not_also_killed(self):
        report = {"findings": [finding()], "rejected": [{**finding(), "reason": "duplicate"}]}
        self.assertEqual(score.score_case(self.case, report)["killed"], [])

    def test_pending_label_counts_nowhere(self):
        s = score.score_case(self.case, {"findings": [finding("c.ts", 5)]})
        self.assertEqual((s["real_total"], s["unlabeled"], s["false_known"]), (2, 0, 0))

    def test_issue_marked_not_real_counts_as_false(self):
        case = {"pr": 1, "issues": [{"id": "r1", "real": False, "file": "a.ts", "lines": [11, 11]}], "known_false": []}
        s = score.score_case(case, {"findings": [finding()]})
        self.assertEqual((s["real_total"], s["false_known"], s["unlabeled"]), (0, 1, 0))

    def test_failed_review_is_reported(self):
        self.assertTrue(score.score_case(self.case, {"error": "збій"})["failed"])


class Comparing(unittest.TestCase):
    @staticmethod
    def summary(found, false=(2, 2), share=(0.5, 0.5), seconds=100):
        run = lambda f, x, s: {"found": f, "false_known": x, "false_upper": x, "not_reviewed_share": s,  # noqa: E731
                               "seconds_max": seconds, "cost_usd": 0.1}
        return score.summarize_runs([run(found[i], false[i], share[i]) for i in range(2)])

    def test_within_noise_is_kept(self):
        base = self.summary((4, 6))
        self.assertTrue(score.compare(base, self.summary((4, 5)))["keep"])

    def test_fewer_real_issues_is_rejected(self):
        verdict = score.compare(self.summary((5, 5)), self.summary((3, 3)))
        self.assertEqual((verdict["keep"], verdict["worse"]), (False, ["found"]))

    def test_more_false_is_rejected(self):
        self.assertIn("false_known", score.compare(self.summary((5, 5)), self.summary((5, 5), (4, 4)))["worse"])

    def test_over_time_budget_is_rejected(self):
        self.assertIn("seconds_max", score.compare(self.summary((5, 5)), self.summary((5, 5), seconds=500))["worse"])


class Spending(unittest.TestCase):
    def test_limit_survives_between_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "spend.json"
            first = run_eval.Spend(path, 1.0)
            self.assertTrue(first.can_start())
            first.add(0.9)
            self.assertFalse(run_eval.Spend(path, 1.0).can_start())

    def test_cost_uses_catalog_prices(self):
        self.assertAlmostEqual(run_eval.cost({"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000}), 0.42)

    def test_stops_before_limit_without_requests(self):
        spend = mock.Mock(can_start=lambda: False, total=19.0)
        with mock.patch.object(run_eval, "run_case") as run:
            summary, scored, stopped = run_eval.run_once([{"pr": 1}], FAKE_KEY, Path("r"), spend, 1)
        run.assert_not_called()
        self.assertTrue(stopped)
        self.assertEqual(scored, [])
        self.assertEqual(summary["cost_usd"], 0)


class Certificates(unittest.TestCase):
    def test_tls_verification_stays_on(self):
        source = (HERE / "eval" / "run_eval.py").read_text("utf-8") + (HERE / "review.py").read_text("utf-8")
        self.assertNotIn("CERT_NONE", source)
        self.assertNotIn("_create_unverified_context", source)


class Rescoring(unittest.TestCase):
    def test_new_labels_change_result_without_requests(self):
        case = {"pr": 1, "issues": [{"id": "r1", "real": None, "file": "a.ts", "lines": [11, 11]}], "known_false": []}
        report = {"findings": [finding()], "files_total": 1, "not_reviewed": [], "seconds": 1.0,
                  "usage": {"prompt_tokens": 1, "completion_tokens": 1, "requests": 1, "truncated": 0}}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(run_eval, "RESULTS", Path(tmp)), \
                mock.patch.object(run_eval, "load_cases", lambda *a: [case]), mock.patch.object(run_eval, "run_case") as run, \
                redirect_stdout(io.StringIO()):
            raw = Path(tmp) / "raw"
            raw.mkdir()
            _, scored = run_eval.score_reports([(case, report)])
            (raw / "base-1.json").write_text(json.dumps(scored))
            case["issues"][0]["real"] = True
            self.assertEqual(run_eval.rescore("base"), 0)
            saved = json.loads((Path(tmp) / "base.json").read_text())
        run.assert_not_called()
        self.assertEqual(saved["runs"][0]["found"], 1)


class Isolation(unittest.TestCase):
    def test_hung_case_becomes_error_not_hang(self):
        import subprocess
        with mock.patch.object(run_eval.subprocess, "run", side_effect=subprocess.TimeoutExpired("x", 1)):
            report = run_eval.run_case_isolated({"pr": 1}, FAKE_KEY, timeout=1)
        self.assertTrue(report["timed_out"])
        self.assertIn("завис", report["error"])

    def test_key_goes_through_env_not_argv(self):
        seen = {}
        def fake_run(cmd, env, **kw):
            seen.update(cmd=cmd, env=env)
            return mock.Mock(stderr=b"")
        with mock.patch.object(run_eval.subprocess, "run", fake_run):
            run_eval.run_case_isolated({"pr": 1}, FAKE_KEY, timeout=1)
        self.assertNotIn(FAKE_KEY, " ".join(seen["cmd"]))
        self.assertEqual(seen["env"]["TOGETHER_API_KEY"], FAKE_KEY)

    def test_child_mode_runs_without_label(self):
        """Саме цей шлях проходить дочірній процес: раніше він падав на вимозі --label."""
        case = {"pr": 1, "title": "T", "issues": [], "known_false": []}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(run_eval, "load_cases", lambda *a: [case]), \
                mock.patch.object(run_eval, "run_case", return_value={"seconds": 1, "note": FAKE_KEY}):
            out = Path(tmp) / "r.json"
            self.assertEqual(run_eval.main(["--one-case", "1", "--out", str(out)], env={"TOGETHER_API_KEY": FAKE_KEY}), 0)
            self.assertNotIn(FAKE_KEY, out.read_text())

    def test_child_crash_keeps_reason_without_key(self):
        crash = mock.Mock(stderr=f"Traceback ... ключ {FAKE_KEY} ValueError: x".encode())
        with mock.patch.object(run_eval.subprocess, "run", return_value=crash):
            report = run_eval.run_case_isolated({"pr": 1}, FAKE_KEY, timeout=1)
        self.assertIn("ValueError", report["error"])
        self.assertNotIn(FAKE_KEY, report["error"])

    def test_hung_case_still_counts_against_budget(self):
        with tempfile.TemporaryDirectory() as tmp:
            spend = run_eval.Spend(Path(tmp) / "s.json", 10)
            hung = {"error": "завис", "seconds": 1, "timed_out": True, "files_total": 1,
                    "usage": {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "truncated": 0}}
            case = {"pr": 1, "issues": [], "known_false": []}
            with mock.patch.object(run_eval, "run_case_isolated", return_value=hung):
                run_eval.run_once([case], FAKE_KEY, Path("r"), spend, 1)
            self.assertAlmostEqual(spend.total, run_eval.RESERVE_USD)


class Numbering(unittest.TestCase):
    def test_gap_after_removed_run_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp)
            for name in ("base-1.json", "base-3.json", "other-7.json"):
                (raw / name).write_text("[]")
            self.assertEqual(run_eval.next_run_number(raw, "base"), 4)
            self.assertEqual(run_eval.next_run_number(raw, "new"), 1)


class Key(unittest.TestCase):
    def test_env_first_then_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / ".env"
            env_file.write_text(f'OTHER=1\nTOGETHER_API_KEY="{FAKE_KEY}"\n')
            self.assertEqual(run_eval.load_key({}, env_file), FAKE_KEY)
            self.assertEqual(run_eval.load_key({"TOGETHER_API_KEY": "x"}, env_file), "x")
            self.assertEqual(run_eval.load_key({}, Path(tmp) / "немає"), "")

    def test_without_key_stops_cleanly(self):
        err = io.StringIO()
        with mock.patch.object(run_eval, "main_env_file", return_value=Path("/немає/.env")), redirect_stderr(err):
            self.assertEqual(run_eval.main(["--label", "x"], env={}), 2)
        self.assertIn("TOGETHER_API_KEY", err.getvalue())

    def test_key_never_reaches_results(self):
        self.assertNotIn(FAKE_KEY, run_eval.scrub(f"HTTP 401 ключ {FAKE_KEY}", FAKE_KEY))


DIFF = """diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1,2 @@
 const a = 1;
+const secretValue = compute(a);
"""


def fake_chat(answers):
    """Підставна модель: ревʼю шматка і друга перевірка відповідають різне."""
    def chat(cfg, messages, tools, *a, **k):
        cfg.usage.add({"prompt_tokens": 10, "completion_tokens": 5}, "stop")
        verifying = messages[0]["content"].startswith("Ти перевіряєш")
        return {"content": json.dumps(answers["verify"] if verifying else answers["review"])}
    return chat


class Report(unittest.TestCase):
    def run_review(self, answers):
        cfg = review.Config(api_key=FAKE_KEY)
        report: dict = {}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(review, "chat", fake_chat(answers)), \
                redirect_stdout(io.StringIO()):
            Path(tmp, "a.ts").write_text("const a = 1;\nconst secretValue = compute(a);\n")
            cfg.repo_dir = Path(tmp)
            text = review.run_review(cfg, {"title": "T"}, DIFF, "", review.RepoTools(Path(tmp)), report)
        return text, report, cfg

    @staticmethod
    def item(evidence="const secretValue = compute(a);"):
        return {"file": "a.ts", "line": 2, "severity": "important", "title": "Проблема", "evidence": evidence, "problem": "Опис"}

    def test_confirmed_goes_to_findings(self):
        _, report, cfg = self.run_review({"review": {"summary": "s", "findings": [self.item()]},
                                          "verify": {"verdict": "confirmed", "reason": "r"}})
        self.assertEqual([f["line"] for f in report["findings"]], [2])
        self.assertEqual(report["rejected"], [])
        self.assertEqual((report["files_total"], report["chunks_failed"], report["not_reviewed"]), (1, 0, []))
        self.assertGreaterEqual(cfg.usage.as_dict()["requests"], 2)

    def test_refuted_is_kept_with_reason(self):
        _, report, _ = self.run_review({"review": {"summary": "s", "findings": [self.item()]},
                                        "verify": {"verdict": "refuted", "reason": "r"}})
        self.assertEqual(report["findings"], [])
        self.assertEqual([r["reason"] for r in report["rejected"]], ["refuted"])

    def test_invented_quote_is_kept_with_reason(self):
        _, report, _ = self.run_review({"review": {"summary": "s", "findings": [self.item("такого рядка немає")]},
                                        "verify": {"verdict": "confirmed", "reason": "r"}})
        self.assertEqual([r["reason"] for r in report["rejected"]], ["no_evidence"])

    def test_report_is_optional_and_does_not_change_comment(self):
        answers = {"review": {"summary": "Підсумок", "findings": []}, "verify": {}}
        text, _, _ = self.run_review(answers)
        cfg = review.Config(api_key=FAKE_KEY)
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(review, "chat", fake_chat(answers)):
            cfg.repo_dir = Path(tmp)
            self.assertEqual(review.run_review(cfg, {"title": "T"}, DIFF, "", review.RepoTools(Path(tmp))), text)

    def test_rules_path_overrides_snapshot(self):
        seen = []
        chat = fake_chat({"review": {"summary": "s", "findings": []}, "verify": {}})
        spy = lambda cfg, messages, *a, **k: (seen.append(messages[0]["content"]), chat(cfg, messages, *a, **k))[1]  # noqa: E731
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(review, "chat", spy):
            root = Path(tmp)
            (root / "tools" / "ai-review").mkdir(parents=True)
            (root / "tools" / "ai-review" / "rules.md").write_text("СТАРІ ПРАВИЛА")
            (root / "new.md").write_text("НОВІ ПРАВИЛА")
            cfg = review.Config(api_key=FAKE_KEY, repo_dir=root, rules_path=root / "new.md")
            review.run_review(cfg, {"title": "T"}, DIFF, "", review.RepoTools(root))
        self.assertIn("НОВІ ПРАВИЛА", seen[0])
        self.assertNotIn("СТАРІ ПРАВИЛА", seen[0])


class Cases(unittest.TestCase):
    def test_every_case_is_complete(self):
        paths = sorted((HERE / "eval" / "cases").glob("pr-*.json"))
        self.assertGreaterEqual(len(paths), 10)
        for path in paths:
            case = json.loads(path.read_text("utf-8"))
            with self.subTest(pr=case["pr"]):
                self.assertTrue(path.with_suffix(".diff").is_file())
                self.assertIn(case["set"], ("dev", "holdout"))
                self.assertRegex(case["head"], r"^[0-9a-f]{40}$")
                ids = [x["id"] for x in case["issues"] + case["known_false"]]
                self.assertEqual(len(ids), len(set(ids)))
                for issue in case["issues"]:
                    self.assertIn(issue["real"], (True, False, None))

    def test_rules_examples_stay_out_of_holdout(self):
        """#71 і #86 стають прикладами в rules.md: контрольний набір не має на них вчитись."""
        for pr in (71, 86):
            case = json.loads((HERE / "eval" / "cases" / f"pr-{pr}.json").read_text("utf-8"))
            self.assertEqual(case["set"], "dev")


class CompareMissing(unittest.TestCase):
    def test_missing_run_is_a_message_not_a_traceback(self):
        err = io.StringIO()
        with redirect_stderr(err):
            self.assertEqual(run_eval.main(["--compare", "base", "немає-такого-прогону"], env={}), 2)
        self.assertIn("немає-такого-прогону", err.getvalue())


class Snapshot(unittest.TestCase):
    def test_whole_commit_is_extracted_even_when_run_from_a_folder_missing_in_it(self):
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            (repo / "src").mkdir(parents=True)
            (repo / "src" / "a.ts").write_text("x")
            run = lambda *a: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", *a],  # noqa: E731
                                            cwd=repo, check=True, capture_output=True)
            run("init", "-q")
            run("add", ".")
            run("commit", "-q", "--no-verify", "-m", "one")
            sha = run("rev-parse", "HEAD").stdout.decode().strip()
            later = repo / "tools" / "eval"  # каталог, якого в тому коміті ще не було
            later.mkdir(parents=True)
            target = Path(tmp) / "snap"
            run_eval.extract(sha, target, repo=later)
            self.assertEqual((target / "src" / "a.ts").read_text(), "x")


if __name__ == "__main__":
    unittest.main()
