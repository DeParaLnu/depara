"""Етап 4: перевірки без моделі (секрети, формат помилки, маршрут без E2E, нові залежності). Без мережі й без ключа.
Рядки, схожі на секрети, тут складаються з частин: справжніх значень у тестах немає."""

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import checks
import review
from test_stage2 import FakeApi, http_error, no_network, ok

FAKE_GH = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6"  # формат токена GitHub, значення вигадане
FAKE_VALUE = "q7Zx9" + "Lm2Kp4Rt8Vw3Ny6Bd1Hs5"


def setUpModule():
    global _guard
    _guard = mock.patch.object(review, "request", no_network)
    _guard.start()


def tearDownModule():
    _guard.stop()


def diff_of(path, added, removed=(), new_file=False, start=1):
    head = f"diff --git a/{path} b/{path}\n" + ("new file mode 100644\n" if new_file else "") + f"--- a/{path}\n+++ b/{path}\n"
    body = "".join(f"-{x}\n" for x in removed) + "".join(f"+{x}\n" for x in added)
    return f"{head}@@ -{start},{len(removed)} +{start},{len(added)} @@\n{body}"


def run(*diffs, files=None):
    by_path = dict(review.split_diff("".join(diffs)))
    return checks.run(review.changed_lines(by_path), lambda p: (files or {}).get(p))


def rules(found):
    return [(f["rule"], f["severity"]) for f in found]


class Secrets(unittest.TestCase):
    def test_known_token_format_is_critical_and_masked(self):
        found = run(diff_of("backend/src/config.ts", [f"const gh = '{FAKE_GH}';"]))
        self.assertEqual(rules(found), [("secrets", "critical")])
        self.assertNotIn(FAKE_GH, json.dumps(found, ensure_ascii=False))  # значення не має потрапити в коментар
        self.assertIn("ghp_…(приховано)", found[0]["evidence"])

    def test_secret_named_assignment_with_real_looking_value(self):
        found = run(diff_of("deploy/docker-compose.yml", [f"      JWT_SECRET: {FAKE_VALUE}"], start=40))
        self.assertEqual(rules(found), [("secrets", "critical")])
        self.assertEqual(found[0]["line"], 40)
        self.assertNotIn(FAKE_VALUE, found[0]["evidence"])

    def test_placeholders_env_reads_and_test_fixtures_are_ignored(self):
        found = run(
            diff_of(".env.example", ["JWT_SECRET=change-me-to-a-long-random-string-0001", "TOGETHER_API_KEY="]),
            diff_of("backend/src/config.ts", ["const secret = process.env.JWT_SECRET ?? '';",
                                              "const apiKey: string = requireEnvironmentVariable0;"]),
            diff_of("backend/test/e2e/f1-login.test.ts", [f"const password = '{FAKE_VALUE}';"]),
            diff_of(".github/workflows/ci.yml", ["          API_TOKEN: ${{ secrets.API_TOKEN }}"]),
        )
        self.assertEqual(found, [])

    def test_committed_env_file(self):
        found = run(diff_of("backend/.env", ["PORT=3000"], new_file=True), diff_of(".env.example", ["PORT=3000"], new_file=True))
        self.assertEqual([(f["file"], f["severity"]) for f in found], [("backend/.env", "critical")])

    def test_connection_string_password(self):
        real = run(diff_of("deploy/app.env.tpl", [f"DATABASE_URL=postgres://depara:{FAKE_VALUE}@db:5432/depara"]))
        self.assertEqual(rules(real), [("secrets", "critical")])
        self.assertNotIn(FAKE_VALUE, real[0]["evidence"])
        self.assertEqual(run(diff_of("docker-compose.yml", ["DATABASE_URL=postgres://depara:depara@localhost:5432/depara"])), [])

    def test_removed_lines_are_not_reported(self):
        self.assertEqual(run(diff_of("a.ts", ["const x = 1;"], removed=[f"const gh = '{FAKE_GH}';"])), [])


class ErrorFormat(unittest.TestCase):
    def test_free_text_error_is_reported(self):
        found = run(diff_of("backend/src/lib/profilePatch.ts", ["  return reply.code(400).send({ error: 'Group not found' });"]))
        self.assertEqual(rules(found), [("error_format", "minor")])
        self.assertIn("Group not found", found[0]["title"])

    def test_message_without_error_field(self):
        found = run(diff_of("backend/src/plugins/errors.ts", ["  return reply.code(404).send({ message: 'nope' });"]))
        self.assertEqual(rules(found), [("error_format", "minor")])

    def test_project_codes_other_folders_and_comments_pass(self):
        found = run(
            diff_of("backend/src/lib/profilePatch.ts", ["  if (!b.groupId) return { ok: false, error: 'GROUP_REQUIRED' };",
                                                         "  return reply.code(403).send({ error: 'HEADMAN_GROUP_LOCKED' });",
                                                         "  // раніше тут було { error: 'bad group' }",
                                                         "  return { error: `${prefix}_FAILED` };", "  type R = { error: string };"]),
            diff_of("mobile/src/api.ts", ["  throw new ApiError({ error: 'network down' });"]),
            diff_of("backend/test/e2e/f9-profile.test.ts", ["  expect(res.json()).toEqual({ error: 'whatever text' });"]),
        )
        self.assertEqual(found, [])

    def test_repeated_mistake_is_capped(self):
        lines = [f"  if (x{i}) return reply.code(400).send({{ error: 'bad thing {i}' }});" for i in range(6)]
        found = run(diff_of("backend/src/routes/admin.ts", lines), diff_of("backend/test/e2e/f7-admin.test.ts", ["x"]))
        self.assertEqual(len(found), checks.MAX_PER_RULE)
        self.assertIn("ще 3", found[-1]["problem"])


class RoutesNeedE2E(unittest.TestCase):
    ROUTE = "  app.post('/push-tokens', { preHandler: requireAuth }, async (req, reply) => {"

    def test_new_route_without_e2e_is_important(self):
        found = run(diff_of("backend/src/routes/pushTokens.ts", [self.ROUTE, "    return reply.code(204).send();"]))
        self.assertEqual(rules(found), [("route_e2e", "important")])
        self.assertIn("POST /push-tokens", found[0]["title"])

    def test_changed_route_logic_without_e2e_is_minor(self):
        found = run(diff_of("backend/src/routes/profile.ts", ["    if (user.role === 'HEADMAN') return reply.code(403).send({ error: 'X' });"]))
        self.assertEqual(rules(found), [("route_e2e", "minor")])

    def test_any_e2e_change_or_comment_only_change_is_enough(self):
        self.assertEqual(run(diff_of("backend/src/routes/pushTokens.ts", [self.ROUTE]),
                             diff_of("backend/test/e2e/f8-notifications.test.ts", ["it('x', () => {});"])), [])
        self.assertEqual(run(diff_of("backend/src/routes/profile.ts", ["  // пояснення", ""])), [])
        self.assertEqual(run(diff_of("backend/src/lib/tokens.ts", ["export const x = 1;"])), [])


class Dependencies(unittest.TestCase):
    PKG = json.dumps({"scripts": {"lint": "eslint ."}, "dependencies": {"zod": "^3.23.0", "fastify": "^5.1.0"}})

    def test_new_package_without_lock_file(self):
        found = run(diff_of("backend/package.json", ['    "zod": "^3.23.0",']), files={"backend/package.json": self.PKG})
        self.assertEqual(rules(found), [("dependencies", "minor"), ("dependencies", "important")])
        self.assertIn("zod", found[0]["title"])
        self.assertIn("backend/package-lock.json", found[1]["problem"])

    def test_new_package_with_lock_file_is_only_a_note(self):
        found = run(diff_of("mobile/package.json", ['    "zod": "^3.23.0",']), diff_of("mobile/package-lock.json", ["x"]),
                    files={"mobile/package.json": self.PKG})
        self.assertEqual(rules(found), [("dependencies", "minor")])
        self.assertIn("npx expo install", found[0]["problem"])

    def test_version_bump_and_scripts_are_not_new_packages(self):
        found = run(diff_of("backend/package.json", ['    "fastify": "^5.1.0",', '    "lint": "eslint ."'],
                            removed=['    "fastify": "^5.0.0",']), files={"backend/package.json": self.PKG})
        self.assertEqual(found, [])

    def test_unreadable_package_json_falls_back_to_line_shape(self):
        found = run(diff_of("backend/package.json", ['    "zod": "^3.23.0",', '    "lint": "eslint ."']),
                    diff_of("backend/package-lock.json", ["x"]))
        self.assertEqual([f["title"] for f in found], ["Нові залежності: zod"])


class InReview(unittest.TestCase):
    DIFF = diff_of("backend/src/routes/profile.ts", ["  return reply.code(400).send({ error: 'Group not found' });"]) + \
        diff_of("backend/test/e2e/f9-profile.test.ts", ["it('x', () => {});"])

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.cfg = review.Config(api_key="k", repo_dir=self.root, two_stage=True, workers=1, verify_steps=0)

    def tearDown(self):
        self.tmp.cleanup()

    def run_review(self, api, diff=None, report=None):
        with mock.patch.object(review, "request", api), redirect_stdout(io.StringIO()):
            return review.run_review(self.cfg, {"title": "T"}, diff or self.DIFF, "", review.RepoTools(self.root), report)

    def test_rule_findings_are_shown_without_asking_the_model_to_verify(self):
        api = FakeApi([ok("Проблем немає."), ok(json.dumps({"summary": "Змінює профіль.", "findings": []}))])
        report: dict = {}
        out = self.run_review(api, report=report)
        self.assertEqual(len(api.bodies), 2)  # лише ревʼю шматка: правило не перевіряється моделлю
        self.assertIn("Код помилки не у форматі", out)
        self.assertIn("правило без моделі", out)
        self.assertIn("Пунктів від моделі: 0, показано: 0.", out)
        self.assertIn("Пунктів від правил без моделі: 1.", out)
        self.assertEqual([(f["pass"], f["rule"]) for f in report["findings"]], [("static", "error_format")])

    def test_rules_do_not_take_slots_from_model_findings(self):
        self.cfg.max_findings, self.cfg.verify = 1, False
        item = {"file": "backend/src/routes/profile.ts", "line": 1, "severity": "important", "title": "Модельний пункт",
                "evidence": "return reply.code(400).send({ error: 'Group not found' });", "problem": "щось"}
        api = FakeApi([ok("н"), ok(json.dumps({"summary": "s", "findings": [item]}, ensure_ascii=False))])
        out = self.run_review(api)
        self.assertIn("Модельний пункт", out)
        self.assertIn("Код помилки не у форматі", out)

    def test_rules_still_reported_when_the_model_fails(self):
        out = self.run_review(FakeApi([http_error(400, "bad request")]))
        self.assertIn("Код помилки не у форматі", out)
        self.assertIn("Модель не дала жодної придатної відповіді", out)

    def test_secret_value_never_reaches_the_comment(self):
        diff = diff_of("backend/src/config.ts", [f"const gh = '{FAKE_GH}';"])
        out = self.run_review(FakeApi([ok("Проблем немає."), ok(json.dumps({"summary": "s", "findings": []}))]), diff)
        self.assertIn("Схоже на секрет", out)
        self.assertIn("критично", out)
        self.assertNotIn(FAKE_GH, out)

    def test_checks_can_be_turned_off_and_a_broken_rule_does_not_stop_the_review(self):
        api = [ok("Проблем немає."), ok(json.dumps({"summary": "s", "findings": []}))]
        self.cfg.checks = False
        self.assertNotIn("правило без моделі", self.run_review(FakeApi(api)))
        self.cfg.checks = True
        with mock.patch.object(checks, "run", side_effect=ValueError("boom")):
            self.assertIn("Суттєвих проблем не знайдено", self.run_review(FakeApi(api)))


if __name__ == "__main__":
    unittest.main()
