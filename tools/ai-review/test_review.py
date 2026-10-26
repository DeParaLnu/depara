"""Тести ШІ-ревʼюера на підставних Together і GitHub API. Запуск: python3 -m unittest discover -s tools/ai-review"""

import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import review

DIFF = """diff --git a/backend/src/a.ts b/backend/src/a.ts
--- a/backend/src/a.ts
+++ b/backend/src/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/backend/package-lock.json b/backend/package-lock.json
--- a/backend/package-lock.json
+++ b/backend/package-lock.json
@@ -1 +1 @@
-x
+y
"""


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
                return self._send(200, DIFF, "text/plain")
            return self._send(200, {"title": "T", "body": "B", "head": {"ref": "f", "sha": "abcdef1234"}, "base": {"ref": "develop"}})
        if self.path.startswith("/repos/o/r/issues/7/comments"):
            return self._send(200, s["comments"])
        self._send(404, {})

    def do_POST(self):
        s, body = Stub.state, self._body()
        if self.path == "/v1/chat/completions":
            s["chat_requests"].append(body)
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


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "README.md").write_text("# Привіт\nдругий рядок\n")
        (self.root / ".env").write_text("SECRET=1\n")
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
        import os
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

    def test_tool_loop_posts_comment(self):
        Stub.state["replies"] = [
            tool_call("read_file", {"path": "README.md"}),
            {"role": "assistant", "content": "<think>роздуми</think>### Підсумок\nГаразд. Суттєвих проблем не знайдено"},
        ]
        self.assertEqual(self.run_main(), 0)
        posted = Stub.state["posted"]
        self.assertIn(review.MARKER, posted)
        self.assertIn("Суттєвих проблем не знайдено", posted)
        self.assertNotIn("роздуми", posted)
        # другий запит до моделі містить результат інструмента
        tool_msgs = [m for m in Stub.state["chat_requests"][1]["messages"] if m["role"] == "tool"]
        self.assertIn("1: # Привіт", tool_msgs[0]["content"])
        self.assertEqual(tool_msgs[0]["tool_call_id"], "c1")
        # правила проєкту потрапили в системний промпт, лок-файл відфільтрований з diff
        first = Stub.state["chat_requests"][0]["messages"]
        self.assertIn("ПРАВИЛО-ПРОЄКТУ", first[0]["content"])
        self.assertIn("backend/src/a.ts", first[1]["content"])
        self.assertNotIn("package-lock.json b/", first[1]["content"].split("<diff>")[1])

    def test_existing_comment_is_updated(self):
        Stub.state["comments"] = [{"id": 99, "body": f"{review.MARKER}\nстаре"}]
        Stub.state["replies"] = [{"role": "assistant", "content": "ок"}]
        self.run_main()
        self.assertEqual(Stub.state["patched"][0], "/repos/o/r/issues/comments/99")
        self.assertNotIn("posted", Stub.state)

    def test_step_limit_forces_final_answer(self):
        self.cfg.max_steps = 2
        Stub.state["replies"] = [tool_call("list_files", {}, "a"), tool_call("list_files", {}, "b"),
                                 {"role": "assistant", "content": "підсумок після ліміту"}]
        out = review.run_agent(self.cfg, [{"role": "user", "content": "x"}], review.RepoTools(self.root))
        self.assertEqual(out, "підсумок після ліміту")
        self.assertNotIn("tools", Stub.state["chat_requests"][-1])

    def test_model_failure_does_not_fail_ci(self):
        Stub.state["replies"] = []  # pop з порожнього списку → 500 на стороні заглушки
        self.assertEqual(self.run_main(), 0)
        self.assertNotIn("posted", Stub.state)

    def test_missing_key_skips(self):
        import os
        os.environ.pop("TOGETHER_API_KEY", None)
        self.assertEqual(review.main(), 0)

    def test_sandbox(self):
        t = review.RepoTools(self.root)
        self.assertIn("Помилка", t.call("read_file", {"path": "../etc/passwd"}))
        self.assertIn("Помилка", t.call("read_file", {"path": ".env"}))
        self.assertIn("Помилка", t.call("read_file", {"path": "/etc/passwd"}))
        self.assertNotIn(".env", t.list_files("."))
        self.assertNotIn("SECRET", t.search_text("SECRET"))
        (self.root / "link").symlink_to("/etc")
        self.assertIn("Помилка", t.call("read_file", {"path": "link/hostname"}))
        self.assertIn("Помилка", t.call("nope", {}))
        self.assertIn("Помилка", t.call("read_file", {"wrong": 1}))

    def test_filter_diff_limit(self):
        kept, skipped = review.filter_diff(DIFF, 10)
        self.assertEqual(kept, "")
        self.assertEqual(len(skipped), 2)


if __name__ == "__main__":
    unittest.main()
