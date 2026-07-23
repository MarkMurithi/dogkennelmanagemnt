import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib import error, request

import server


class ApprovalFlowTests(unittest.TestCase):
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
        req = request.Request(f"{self.base_url}{path}", data=data, headers=headers, method=method)
        try:
            with request.urlopen(req, timeout=3) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8")
            return json.loads(body)

    def test_string_db_path_is_supported(self):
        server.DB_PATH = str(self.db_path)
        server.init_db()
        self.assertTrue(self.db_path.exists())

    def test_staff_create_requires_admin_approval(self):
        admin_login = self._request_json(
            "/api/auth/login",
            {"identifier": "admin@bigpaw.com", "password": "admin123"},
        )
        self.assertTrue(admin_login.get("ok"), admin_login)
        admin_token = admin_login.get("token")

        create_staff = self._request_json(
            "/api/users",
            {"name": "Staff User", "email": "staff3@example.com", "password": "staffpass", "role": "staff", "active": True},
            token=admin_token,
        )
        self.assertTrue(create_staff.get("ok"), create_staff)

        staff_login = self._request_json(
            "/api/auth/login",
            {"identifier": "staff3@example.com", "password": "staffpass"},
        )
        self.assertTrue(staff_login.get("ok"), staff_login)
        staff_token = staff_login.get("token")

        pending_result = self._request_json(
            "/api/dogs",
            {"name": "Rex", "breed": "Labrador", "gender": "Male"},
            token=staff_token,
        )
        self.assertTrue(pending_result.get("ok"), pending_result)
        self.assertTrue(pending_result.get("pending"), pending_result)

        dogs_result = self._request_json("/api/dogs", token=admin_token, method="GET")
        self.assertEqual([], dogs_result)

        approvals_result = self._request_json("/api/pending-approvals", token=admin_token, method="GET")
        self.assertTrue(approvals_result.get("ok"), approvals_result)
        self.assertTrue(approvals_result.get("items"), approvals_result)
        approval_id = approvals_result["items"][0]["id"]

        approve_result = self._request_json(
            f"/api/pending-approvals/{approval_id}/approve",
            token=admin_token,
        )
        self.assertTrue(approve_result.get("ok"), approve_result)

        approved_dogs = self._request_json("/api/dogs", token=admin_token, method="GET")
        self.assertEqual(1, len(approved_dogs))
        self.assertEqual("Rex", approved_dogs[0]["name"])


if __name__ == "__main__":
    unittest.main()
