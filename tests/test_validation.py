import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib import error, request

import server


class ValidationTests(unittest.TestCase):
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

    def _admin_token(self):
        login = self._request_json("/api/auth/login", {"identifier": "admin@bigpaw.com", "password": "admin123"})
        return login.get("token")

    def test_dog_validation_requires_name_and_breed(self):
        result = self._request_json(
            "/api/dogs",
            {"name": "", "breed": "", "gender": "Male"},
            token=self._admin_token(),
        )
        self.assertFalse(result.get("ok"), result)
        self.assertIn("name", str(result.get("error", "")).lower())

    def test_duplicate_dog_name_is_rejected(self):
        first = self._request_json(
            "/api/dogs",
            {"name": "Buddy", "breed": "Labrador", "gender": "Male"},
            token=self._admin_token(),
        )
        self.assertTrue(first.get("ok"), first)

        duplicate = self._request_json(
            "/api/dogs",
            {"name": "Buddy", "breed": "Golden", "gender": "Male"},
            token=self._admin_token(),
        )
        self.assertFalse(duplicate.get("ok"), duplicate)
        self.assertIn("already exists", str(duplicate.get("error", "")).lower())

    def test_record_validation_requires_a_date(self):
        result = self._request_json(
            "/api/dogs",
            {
                "name": "Milo",
                "breed": "Beagle",
                "gender": "Male",
                "records": {
                    "health": [{"type": "Checkup", "notes": "No date"}]
                },
            },
            token=self._admin_token(),
        )
        self.assertFalse(result.get("ok"), result)
        self.assertIn("date", str(result.get("error", "")).lower())

    def test_finance_validation_rejects_invalid_amount(self):
        result = self._request_json(
            "/api/finance",
            {"type": "expense", "title": "Food", "category": "Food", "amount": 0, "date": "2026-07-23"},
            token=self._admin_token(),
        )
        self.assertFalse(result.get("ok"), result)
        self.assertIn("amount", str(result.get("error", "")).lower())


if __name__ == "__main__":
    unittest.main()
