"""Тести ШІ-ревʼюера на підставних Together і GitHub API. Запуск: python3 -m unittest discover -s tools/ai-review"""

import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import review

DIFF = """diff --git a/backend/src/a.ts b/backend/src/a.ts
--- a/backend/src/a.ts
+++ b/backend/src/a.ts
@@ -1,2 +1,3 @@
 import x from 'y';
-const total = 0;
+const total = items.length;
+export default total;
diff --git a/backend/package-lock.json b/backend/package-lock.json
--- a/backend/package-lock.json
+++ b/backend/package-lock.json
@@ -1 +1 @@
-x
+y
"""

A_TS = "import x from 'y';\nconst total = items.length;\nexport default total;\n"


class Stub(BaseHTTPRequestHandler):
    """Один сервер імітує і GitHub, і Together."""

    state: dict = {}

    def log_message(self, *a):  # тиша в тестах
        pass

    def _send(self, code, body, ctype="application/json"):
        raw = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body)).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        s = Stub.state
        if self.path.startswith("/repos/o/r/pulls/7"):
            if "diff" in (self.headers.get("Accept") or ""):
                return self._send(200, s.get("diff", DIFF), "text/plain")
            return self._send(200, {"title": "T", "body": "B", "head": {"ref": "f", "sha": "abcdef1234"}, "base": {"ref": "develop"}})
        if self.path.startswith("/repos/o/r/commits/abcdef1234/check-runs"):
            return self._send(200, {"check_runs": s.get("checks", [])})
        if self.path.startswith("/repos/o/r/issues/7/comments"):
            return self._send(200, s["comments"])
        self._send(404, {})

    def do_POST(self):
        s, body = Stub.state, self._body()
        if self.path == "/v1/chat/completions":
            s["chat_requests"].append(body)
            if s.get("tick"):
                s["tick"]()
            if s.get("reject_json_mode") and "response_format" in body:
                return self._send(400, {"error": "response_format не підтримується"})
            return self._send(200, {"choices": [{"message": s["replies"].pop(0)}]})
        if self.path == "/repos/o/r/issues/7/comments":
            s["posted"] = body["body"]
            return self._send(201, {})
        self._send(404, {})

    def do_PATCH(self):
        Stub.state["patched"] = (self.path, self._body()["body"])
        self._send(200, {})


def tool_call(name, args, call_id="c1"):
    return {"role": "assistant", "content": None,
            "tool_calls": [{"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}


def say(obj):
    """Відповідь моделі: JSON як текст."""
    return {"role": "assistant", "content": obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)}


def finding(**over):
    base = {"file": "backend/src/a.ts", "line": 2, "severity": "important", "title": "Порожній список ламає підсумок",
            "evidence": "const total = items.length;", "problem": "items може бути undefined", "fix": "додати перевірку"}
    return {**base, **over}


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "README.md").write_text("# Привіт\nдругий рядок\n")
        (self.root / ".env").write_text("SECRET=1\n")
        (self.root / "backend" / "src").mkdir(parents=True)
        (self.root / "backend" / "src" / "a.ts").write_text(A_TS)
        (self.root / ".github" / "workflows").mkdir(parents=True)
        (self.root / ".github" / "workflows" / "x.yml").write_text("name: x\non: push\n")
        (self.root / "tools" / "ai-review").mkdir(parents=True)
        (self.root / "tools" / "ai-review" / "rules.md").write_text("ПРАВИЛО-ПРОЄКТУ")
        Stub.state = {"comments": [], "chat_requests": [], "replies": []}
        self.server = HTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{self.server.server_port}"
        self.cfg = review.Config(api_key="k", base_url=url + "/v1", github_token="t", github_api=url,
                                 repo="o/r", pr_number=7, repo_dir=self.root, timeout=5)

    def tearDown(self):
        self.server.shutdown()
        self.tmp.cleanup()

    def run_main(self):
        env = {"TOGETHER_API_KEY": "k", "TOGETHER_BASE_URL": self.cfg.base_url, "GITHUB_TOKEN": "t",
               "GITHUB_API_URL": self.cfg.github_api, "GITHUB_REPOSITORY": "o/r", "PR_NUMBER": "7",
               "REPO_DIR": str(self.root)}
        old = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        try:
            return review.main()
        finally:
            for k, v in old.items():
                os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    # ---------- конвеєр ----------

    def test_pipeline_filters_duplicates_and_hallucinations(self):
        """Те, що було на PR #52: той самий пункт тричі; плюс вигадана цитата. Лишається один пункт з виправленим рядком."""
        Stub.state["checks"] = [{"name": "backend-e2e", "status": "completed", "conclusion": "success"},
                                {"name": "review", "status": "completed", "conclusion": "success"},
                                {"name": "CodeRabbit", "status": "in_progress", "conclusion": None}]
        Stub.state["replies"] = [
            tool_call("read_file", {"path": "README.md"}),
            say({"summary": "Додає підрахунок.", "findings": [
                finding(line=99),  # номер рядка хибний, цитата правильна
                finding(line=2),
                finding(line=3, title="Порожній список ламає підсумок!"),
                finding(title="Витік пароля", evidence="password = 'hunter2'", problem="пароль у коді", line=1),
            ]}),
            say({"verdict": "confirmed", "reason": "так"}),
        ]
        self.assertEqual(self.run_main(), 0)
        posted = Stub.state["posted"]
        self.assertIn(review.MARKER, posted)
        self.assertIn("`backend/src/a.ts:2`", posted)  # рядок виправлено за цитатою
        self.assertEqual(posted.count("Порожній список ламає підсумок"), 1)
        self.assertNotIn("Витік пароля", posted)
        self.assertIn("1 без підтвердження цитатою", posted)
        self.assertIn("2 дублікатів", posted)
        # правила, нумерований diff і статус CI потрапили в запит; службовий lock-файл і власна перевірка ні
        first = Stub.state["chat_requests"][0]["messages"]
        self.assertIn("ПРАВИЛО-ПРОЄКТУ", first[0]["content"])
        self.assertIn("   2| +const total = items.length;", first[1]["content"])
        self.assertIn("backend-e2e: success", first[1]["content"])
        self.assertIn("CodeRabbit: виконується", first[1]["content"])  # паралельний CI теж корисно знати
        self.assertNotIn("review: success", first[1]["content"])
        self.assertNotIn("package-lock.json b/", first[1]["content"].split("<diff>")[1])
        self.assertNotIn("службовий файл", first[1]["content"])  # у запит до моделі службові файли не попадають
        self.assertIn("Службових файлів пропущено: 1", posted)
        # результат інструмента повернувся до моделі
        tool_msgs = [m for m in Stub.state["chat_requests"][1]["messages"] if m["role"] == "tool"]
        self.assertIn("1: # Привіт", tool_msgs[0]["content"])

    def test_verifier_refutes_wrong_claim(self):
        """Хибне твердження, що проходить перевірку цитати, відсіює друга перевірка на фрагменті коду."""
        Stub.state["replies"] = [
            say({"summary": "s", "findings": [finding(title="Змінна total невидима", problem="не існує")]}),
            say({"verdict": "refuted", "reason": "у коді total визначено"}),
        ]
        self.run_main()
        posted = Stub.state["posted"]
        self.assertIn("Суттєвих проблем не знайдено", posted)
        self.assertNotIn("Змінна total невидима", posted)
        self.assertIn("1 спростовано чи не підтверджено", posted)
        verify_req = Stub.state["chat_requests"][1]["messages"]
        self.assertIn("2: const total = items.length;", verify_req[1]["content"])  # перевіряльник бачить код
        self.assertNotIn("tools", Stub.state["chat_requests"][1])

    def test_verifier_sees_where_the_block_is_used(self):
        """Регресія з PR #52: стиль buttonIcon визначено внизу файла, а іконку з кольором задано вище, у JSX."""
        src = ("export function Login() {\n  return (\n    <View style={styles.buttonIcon}>\n"
               "      <Ionicons name=\"mail\" color={colors.accent} />\n    </View>\n  );\n}\n\n"
               "const styles = StyleSheet.create({\n  buttonIcon: {\n    width: 26,\n"
               "    backgroundColor: colors.surface,\n  },\n});\n")
        (self.root / "backend" / "src" / "a.ts").write_text(src)
        f = review.parse_finding(finding(evidence="backgroundColor: colors.surface,", line=12))
        window = review.code_window(f, review.RepoTools(self.root), {}, radius=1)
        self.assertIn("де вжито `buttonIcon`", window)
        self.assertIn('color={colors.accent}', window)
        self.assertEqual(review.enclosing_name(src.splitlines(), 11), "buttonIcon")

    def test_unsure_minor_dropped_but_unsure_important_kept(self):
        Stub.state["replies"] = [
            say({"summary": "s", "findings": [
                finding(severity="minor", title="Дрібниця A", evidence="import x from 'y';", line=1, problem="p1"),
                finding(severity="important", title="Важливе B", problem="p2"),
            ]}),
            say({"verdict": "unsure"}), say({"verdict": "unsure"}),
        ]
        self.run_main()
        posted = Stub.state["posted"]
        self.assertIn("Важливе B", posted)
        self.assertNotIn("Дрібниця A", posted)

    def test_verification_can_be_disabled(self):
        self.cfg.verify = False
        Stub.state["replies"] = [say({"summary": "s", "findings": [finding()]})]
        os.environ["AI_REVIEW_VERIFY"] = "0"
        try:
            self.run_main()
        finally:
            del os.environ["AI_REVIEW_VERIFY"]
        self.assertEqual(len(Stub.state["chat_requests"]), 1)
        self.assertIn("Порожній список ламає підсумок", Stub.state["posted"])

    def test_malformed_json_is_repaired_once(self):
        Stub.state["replies"] = [say("Ось ревʼю: все добре, але є дрібниця"),
                                 say("```json\n" + json.dumps({"summary": "Виправлено формат.", "findings": []}) + "\n```")]
        self.run_main()
        self.assertIn("Виправлено формат.", Stub.state["posted"])
        self.assertIn("Це не коректний JSON", Stub.state["chat_requests"][1]["messages"][-1]["content"])

    def test_json_mode_fallback_when_api_rejects_response_format(self):
        Stub.state["reject_json_mode"] = True
        Stub.state["replies"] = [say("не json"), say({"summary": "Без json_mode.", "findings": []})]
        self.run_main()
        self.assertIn("Без json_mode.", Stub.state["posted"])

    def test_evidence_copied_with_line_number_and_diff_marker(self):
        Stub.state["replies"] = [
            say({"summary": "s", "findings": [finding(evidence="   2| +const total = items.length;", line=0)]}),
            say({"verdict": "confirmed"}),
        ]
        self.run_main()
        self.assertIn("`backend/src/a.ts:2`", Stub.state["posted"])

    def test_dotted_path_is_kept(self):
        """Регресія: lstrip('./') з'їдав крапку в .github/…"""
        Stub.state["diff"] = DIFF.replace("backend/src/a.ts", ".github/workflows/x.yml")
        Stub.state["replies"] = [
            say({"summary": "s", "findings": [finding(file=".github/workflows/x.yml", line=2)]}),
            say({"verdict": "confirmed"}),
        ]
        self.run_main()
        self.assertIn("`.github/workflows/x.yml:2`", Stub.state["posted"])

    def test_mentions_are_defused(self):
        Stub.state["replies"] = [say({"summary": "Привіт @octocat", "findings": [finding(problem="спитайте @octocat")]}),
                                 say({"verdict": "confirmed"})]
        self.run_main()
        self.assertNotIn("@octocat", Stub.state["posted"])

    def test_findings_are_capped_and_sorted(self):
        self.cfg.max_findings = 1
        Stub.state["replies"] = [
            say({"summary": "s", "findings": [
                finding(severity="minor", title="Дрібна одна", evidence="import x from 'y';", line=1, problem="alpha beta gamma"),
                finding(severity="critical", title="Критична одна", evidence="export default total;", line=3, problem="delta epsilon zeta"),
            ]}),
            say({"verdict": "confirmed"}), say({"verdict": "confirmed"}),
        ]
        os.environ["AI_REVIEW_MAX_FINDINGS"] = "1"
        try:
            self.run_main()
        finally:
            del os.environ["AI_REVIEW_MAX_FINDINGS"]
        posted = Stub.state["posted"]
        self.assertIn("Критична одна", posted)
        self.assertNotIn("Дрібна одна", posted)
        self.assertIn("1 поза лімітом", posted)

    # ---------- зауваження CodeRabbit до PR #54 ----------

    def test_chunk_limit_applies_to_annotated_text_and_big_files_are_split(self):
        """Ліміт стосується того, що бачить модель (з номерами рядків), а великий файл ділиться за блоками змін."""
        hunks = "".join(f"@@ -{i * 100},1 +{i * 100},1 @@\n+{'x' * 450}\n" for i in range(1, 7))
        diff = f"diff --git a/backend/src/big.ts b/backend/src/big.ts\n--- a/backend/src/big.ts\n+++ b/backend/src/big.ts\n{hunks}"
        cfg = review.Config(chunk_chars=1100, max_chunks=10)
        chunks, skipped = review.plan_chunks(diff, cfg)
        self.assertGreater(len(chunks), 1)
        self.assertEqual(skipped, [])
        for group in chunks:
            self.assertLessEqual(sum(len(text) for _, text in group), cfg.chunk_chars)
            for _, text in group:
                self.assertIn("+++ b/backend/src/big.ts", text)  # кожна частина має заголовок файла
        # жоден блок змін не загубився
        joined = "".join(text for g in chunks for _, text in g)
        self.assertEqual(joined.count("@@ -"), 6)

    def test_oversized_single_hunk_is_truncated_with_marker(self):
        diff = ("diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n+" + "y" * 5000 + "\n")
        chunks, _ = review.plan_chunks(diff, review.Config(chunk_chars=1000))
        text = chunks[0][0][1]
        self.assertLessEqual(len(text), 1000)
        self.assertIn("diff обрізано", text)

    def test_partially_reviewed_file_is_reported(self):
        hunks = "".join(f"@@ -{i * 100},1 +{i * 100},1 @@\n+{'x' * 450}\n" for i in range(1, 7))
        diff = f"diff --git a/backend/src/big.ts b/backend/src/big.ts\n--- a/backend/src/big.ts\n+++ b/backend/src/big.ts\n{hunks}"
        _, skipped = review.plan_chunks(diff, review.Config(chunk_chars=1100, max_chunks=1))
        self.assertEqual(skipped, ["backend/src/big.ts (переглянуто частково)"])

    def test_evidence_must_be_a_line_of_the_diff(self):
        """Рядок, якого немає в diff, відкидається, навіть якщо він є у файлі."""
        (self.root / "backend" / "src" / "a.ts").write_text(A_TS + "const hidden = secret();\n")
        Stub.state["replies"] = [
            say({"summary": "s", "findings": [
                finding(title="Рядок поза змінами", evidence="const hidden = secret();", line=4, problem="поза diff"),
                finding(),
            ]}),
            say({"verdict": "confirmed"}),
        ]
        self.run_main()
        posted = Stub.state["posted"]
        self.assertNotIn("Рядок поза змінами", posted)
        self.assertIn("Порожній список ламає підсумок", posted)
        self.assertIn("1 без підтвердження цитатою", posted)

    def test_anchor_accepts_context_and_removed_lines_but_not_headers(self):
        diff_by_path = dict(review.split_diff(DIFF))
        ctx = review.parse_finding(finding(evidence="import x from 'y';", line=0))
        self.assertTrue(review.anchor_finding(ctx, diff_by_path))
        self.assertEqual(ctx.line, 1)
        removed = review.parse_finding(finding(evidence="const total = 0;", line=0))
        self.assertTrue(review.anchor_finding(removed, diff_by_path))
        self.assertEqual(removed.line, 2)  # позиція видаленого рядка в новій версії
        header = review.parse_finding(finding(evidence="+++ b/backend/src/a.ts", line=0))
        self.assertFalse(review.anchor_finding(header, diff_by_path))
        nofile = review.parse_finding(finding(file="nope.ts"))
        self.assertFalse(review.anchor_finding(nofile, diff_by_path))

    def test_request_gets_only_the_remaining_time(self):
        seen = []

        def fake_request(method, url, headers, body=None, timeout=60):
            seen.append(timeout)
            return json.dumps({"choices": [{"message": {"content": "{}"}}]}), {}

        clock = {"t": 0.0}
        budget = review.Budget(100, clock=lambda: clock["t"]).sub(85)  # лишилось 15 с
        cfg = review.Config(api_key="k", timeout=120)
        orig = review.request
        review.request = fake_request
        try:
            review.chat(cfg, [], None, budget=budget)
            clock["t"] = 8.0  # лишилось 7 с: менше мінімуму, запиту не буде
            with self.assertRaises(RuntimeError):
                review.chat(cfg, [], None, budget=budget)
        finally:
            review.request = orig
        self.assertEqual(seen, [15])

    def test_verification_skipped_when_time_is_spent(self):
        """Час вийшов після ревʼю шматків: пункти не перевіряються, важливі лишаються з приміткою, дрібні ні."""
        clock = {"t": 0.0}
        real = review.time.monotonic
        review.time.monotonic = lambda: clock["t"]
        Stub.state["tick"] = lambda: clock.update(t=95.0)  # після першого запиту до моделі «минуло» 95 с зі 100
        Stub.state["replies"] = [say({"summary": "s", "findings": [
            finding(severity="important", title="Важливе без перевірки"),
            finding(severity="minor", title="Дрібне без перевірки", evidence="import x from 'y';", line=1, problem="інше"),
        ]})]
        os.environ["AI_REVIEW_BUDGET_SECONDS"] = "100"
        try:
            self.run_main()
        finally:
            review.time.monotonic = real
            del os.environ["AI_REVIEW_BUDGET_SECONDS"]
        posted = Stub.state["posted"]
        self.assertEqual(len(Stub.state["chat_requests"]), 1)  # жодного запиту перевірки чи підсумку
        self.assertIn("Важливе без перевірки", posted)
        self.assertNotIn("Дрібне без перевірки", posted)
        self.assertIn("Другою перевіркою не охоплено пунктів: 2", posted)

    def test_chunks_after_the_chunk_budget_are_skipped_with_a_note(self):
        clock = {"t": 0.0}
        real = review.time.monotonic
        review.time.monotonic = lambda: clock["t"]
        Stub.state["diff"] = (DIFF.split("diff --git a/backend/package-lock.json")[0]
                              + "diff --git a/backend/src/b.ts b/backend/src/b.ts\n--- a/backend/src/b.ts\n+++ b/backend/src/b.ts\n@@ -1 +1 @@\n+" + "z" * 300 + "\n")
        Stub.state["tick"] = lambda: clock.update(t=80.0)  # після першого шматка бюджет шматків (70 с) вичерпано
        Stub.state["replies"] = [say({"summary": "перший шматок", "findings": []})]
        os.environ["AI_REVIEW_BUDGET_SECONDS"] = "100"
        os.environ["AI_REVIEW_CHUNK_CHARS"] = "400"
        try:
            self.run_main()
        finally:
            review.time.monotonic = real
            del os.environ["AI_REVIEW_BUDGET_SECONDS"], os.environ["AI_REVIEW_CHUNK_CHARS"]
        posted = Stub.state["posted"]
        self.assertEqual(len(Stub.state["chat_requests"]), 1)
        self.assertIn("вичерпано часовий бюджет. Пропущено: backend/src/b.ts", posted)

    # ---------- поведінка при збоях ----------

    def test_existing_comment_is_updated(self):
        Stub.state["comments"] = [{"id": 99, "body": f"{review.MARKER}\nстаре"}]
        Stub.state["replies"] = [say({"summary": "ок", "findings": []})]
        self.run_main()
        self.assertEqual(Stub.state["patched"][0], "/repos/o/r/issues/comments/99")
        self.assertNotIn("posted", Stub.state)

    def test_step_limit_forces_final_answer(self):
        self.cfg.max_steps = 2
        Stub.state["replies"] = [tool_call("list_files", {}, "a"), tool_call("list_files", {}, "b"),
                                 say({"summary": "після ліміту", "findings": []})]
        out = review.run_agent(self.cfg, [{"role": "user", "content": "x"}], review.RepoTools(self.root))
        self.assertIn("після ліміту", out)
        self.assertNotIn("tools", Stub.state["chat_requests"][-1])

    def test_model_failure_does_not_fail_ci(self):
        Stub.state["replies"] = []  # pop з порожнього списку → 500 на стороні заглушки
        self.assertEqual(self.run_main(), 0)
        self.assertNotIn("posted", Stub.state)

    def test_missing_ci_permission_does_not_break_review(self):
        Stub.state["replies"] = [say({"summary": "ок", "findings": []})]
        Stub.state["checks"] = None  # заглушка віддасть некоректну відповідь
        self.run_main()
        self.assertIn("ок", Stub.state["posted"])
        self.assertIn("невідомо", Stub.state["chat_requests"][0]["messages"][1]["content"])

    def test_missing_key_skips(self):
        os.environ.pop("TOGETHER_API_KEY", None)
        self.assertEqual(review.main(), 0)

    # ---------- допоміжні функції ----------

    def test_sandbox(self):
        t = review.RepoTools(self.root)
        self.assertIn("Помилка", t.call("read_file", {"path": "../etc/passwd"}))
        self.assertIn("Помилка", t.call("read_file", {"path": ".env"}))
        self.assertIn("Помилка", t.call("read_file", {"path": "/etc/passwd"}))
        self.assertNotIn(".env", t.list_files("."))
        self.assertNotIn("SECRET", t.search_text("SECRET"))
        self.assertIsNone(t.read_text(".env"))
        self.assertIsNone(t.read_text("../x"))
        (self.root / "link").symlink_to("/etc")
        self.assertIn("Помилка", t.call("read_file", {"path": "link/hostname"}))
        self.assertIsNone(t.read_text("link/hostname"))
        self.assertIn("Помилка", t.call("nope", {}))
        self.assertIn("Помилка", t.call("read_file", {"wrong": 1}))

    def test_filter_diff_limit(self):
        kept, skipped = review.filter_diff(DIFF, 10)
        self.assertEqual(kept, "")
        self.assertEqual(len(skipped), 2)

    def test_annotate_diff_numbers_new_lines(self):
        text = review.annotate_diff(DIFF.split("diff --git a/backend/package-lock.json")[0])
        self.assertIn("   1|  import x from 'y';", text)
        self.assertIn("    | -const total = 0;", text)  # видалений рядок без номера
        self.assertIn("   2| +const total = items.length;", text)
        self.assertIn("   3| +export default total;", text)

    def test_plan_chunks_groups_orders_and_limits(self):
        def file(path, size):
            return f"diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -1 +1 @@\n+{'x' * size}\n"
        diff = file("docs/a.md", 100) + file("backend/src/b.ts", 600) + file("backend/src/c.ts", 600) + file("backend/test/d.ts", 100)
        cfg = review.Config(chunk_chars=1000, max_chunks=2)
        chunks, skipped = review.plan_chunks(diff, cfg)
        names = [[p for p, _ in c] for c in chunks]
        self.assertEqual(names, [["backend/src/b.ts"], ["backend/src/c.ts", "backend/test/d.ts"]])  # код → тести → документація
        self.assertEqual(len(skipped), 1)
        self.assertIn("docs/a.md", skipped[0])

    def test_dedupe_keeps_most_severe(self):
        a = review.parse_finding(finding(severity="minor", line=5))
        b = review.parse_finding(finding(severity="critical", line=5))
        other = review.parse_finding(finding(file="x.ts", title="Інше", problem="зовсім інше"))
        kept = review.dedupe([a, b, other])
        self.assertEqual(len(kept), 2)
        self.assertEqual(kept[0].severity, "critical")

    def test_parse_finding_rejects_without_evidence(self):
        self.assertIsNone(review.parse_finding(finding(evidence="")))
        self.assertIsNone(review.parse_finding({"file": "a", "title": "t"}))
        self.assertIsNone(review.parse_finding("рядок"))
        self.assertEqual(review.parse_finding(finding(severity="major")).severity, "important")
        self.assertEqual(review.parse_finding(finding(severity="???")).severity, "minor")


if __name__ == "__main__":
    unittest.main()
