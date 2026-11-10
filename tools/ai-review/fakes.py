"""Підставні обʼєкти для тестів ревʼюера: API моделі без мережі, приклади diff і пунктів."""

import json

DIFF = """diff --git a/backend/src/a.ts b/backend/src/a.ts
--- a/backend/src/a.ts
+++ b/backend/src/a.ts
@@ -1,2 +1,3 @@
 import x from 'y';
-const total = 0;
+const total = items.length;
+export default total;
"""
A_TS = "import x from 'y';\nconst total = items.length;\nexport default total;\n"


def ok(content="", finish="stop", tool_calls=None):
    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return {"choices": [{"message": message, "finish_reason": finish}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}}


class FakeApi:
    """Підставний /chat/completions: відповіді по черзі, усі тіла запитів записуються."""

    def __init__(self, replies):
        self.replies, self.bodies = list(replies), []

    def __call__(self, method, url, headers, body=None, timeout=60, deadline=None):
        self.bodies.append(json.loads(json.dumps(body)))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return json.dumps(reply), {}


def no_network(*a, **k):
    raise AssertionError("тест пішов у справжню мережу")


def http_error(code, text):
    return RuntimeError(f"POST https://api.together.xyz/v1/chat/completions → HTTP {code}: {text}")


def finding(**over):
    base = {"file": "backend/src/a.ts", "line": 2, "severity": "important", "title": "Порожній список ламає підсумок",
            "evidence": "const total = items.length;", "problem": "items може бути undefined", "fix": "додати перевірку"}
    return {**base, **over}


def diff_of(path, added, removed=(), new_file=False, start=1):
    head = f"diff --git a/{path} b/{path}\n" + ("new file mode 100644\n" if new_file else "") + f"--- a/{path}\n+++ b/{path}\n"
    body = "".join(f"-{x}\n" for x in removed) + "".join(f"+{x}\n" for x in added)
    return f"{head}@@ -{start},{len(removed)} +{start},{len(added)} @@\n{body}"
