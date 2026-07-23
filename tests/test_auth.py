import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib import error, request

import server


class AuthFlowTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.db"
        server.DB_PATH = self.db_path
        server.init_db()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.KennelHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.httpd.server_port}"

    def tearDown(self):
        try:
            self.httpd.shutdown()
        except Exception:
            pass
        try:
            self.httpd.server_close()
        except Exception:
            pass
        try:
            self.thread.join(timeout=2)
        except Exception:
            pass
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def _request_json(self, path, payload=None, method="POST", token=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with request.urlopen(req, timeout=3) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8")
            return json.loads(body)

    def test_signup_returns_token_and_login_uses_hashed_password(self):
        signup_result = self._request_json(
            "/api/auth/signup",
            {"name": "Test User", "email": "test@example.com", "password": "secretpass"},
        )

        self.assertTrue(signup_result.get("ok"), signup_result)
        self.assertTrue(signup_result.get("token"), signup_result)

        login_result = self._request_json(
            "/api/auth/login",
            {"identifier": "test@example.com", "password": "secretpass"},
        )

        self.assertTrue(login_result.get("ok"), login_result)
        self.assertTrue(login_result.get("token"), login_result)

    def test_admin_can_create_and_disable_user(self):
        admin_login = self._request_json(
            "/api/auth/login",
            {"identifier": "admin@bigpaw.com", "password": "admin123"},
        )
        self.assertTrue(admin_login.get("ok"), admin_login)
        admin_token = admin_login.get("token")

        create_result = self._request_json(
            "/api/users",
            {"name": "New Staff", "email": "staff@example.com", "password": "staffpass", "role": "staff", "active": True},
            token=admin_token,
        )
        self.assertTrue(create_result.get("ok"), create_result)
        user_id = create_result.get("user", {}).get("id")
        self.assertTrue(user_id)

        disable_result = self._request_json(
            f"/api/users/{user_id}",
            {"active": False},
            method="PUT",
            token=admin_token,
        )
        self.assertTrue(disable_result.get("ok"), disable_result)
        self.assertFalse(disable_result.get("user", {}).get("active", True))


if __name__ == "__main__":
    unittest.main()
