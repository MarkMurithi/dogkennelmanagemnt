import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib import error, request

import server


class BackupTests(unittest.TestCase):
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

    def test_manual_backup_and_history_are_created(self):
        backup = self._request_json("/api/backups", {"label": "Release backup"}, token=self._admin_token())
        self.assertTrue(backup.get("ok"), backup)
        history = self._request_json("/api/backups", None, method="GET", token=self._admin_token())
        self.assertTrue(isinstance(history, list), history)
        self.assertGreaterEqual(len(history), 1)
        self.assertEqual(history[0].get("label"), "Release backup")

    def test_restore_backup_restores_deleted_dog(self):
        created = self._request_json(
            "/api/dogs",
            {"name": "Max", "breed": "German Shepherd", "gender": "Male"},
            token=self._admin_token(),
        )
        self.assertTrue(created.get("ok"), created)

        backup = self._request_json("/api/backups", {"label": "Restore test"}, token=self._admin_token())
        self.assertTrue(backup.get("ok"), backup)

        deleted = self._request_json(f"/api/dogs/{created['dog']['id']}", None, method="DELETE", token=self._admin_token())
        self.assertTrue(deleted.get("ok"), deleted)

        restored = self._request_json("/api/backups/restore", {"backupId": backup["backup"]["id"]}, token=self._admin_token())
        self.assertTrue(restored.get("ok"), restored)

        dogs = self._request_json("/api/dogs", None, method="GET", token=self._admin_token())
        self.assertTrue(any(item.get("name") == "Max" for item in dogs))

    def test_import_backup_file_restores_dogs_and_daily_reports(self):
        backup_path = Path(self.temp_dir.name) / "import-backup.json"
        backup_path.write_text(json.dumps({
            "dogs": [
                {"id": "d-import-1", "name": "Bella", "breed": "Beagle", "gender": "Female", "records": {}, "attachments": [], "createdAt": "2026-07-24T09:00:00Z"}
            ],
            "dailyReports": [
                {"id": "dr-import-1", "date": "2026-07-24", "foodRemaining": "2 bags", "foodToday": "1 bag", "kennelsWashed": True, "dogStatuses": [], "visitors": "0", "personInCharge": "Jane", "medicationNotes": "", "cleaningChecklist": "Done", "staffComments": "All good", "notes": "Imported report", "createdAt": "2026-07-24T09:10:00Z"}
            ],
            "users": [
                {"id": "u-admin-1", "name": "Admin User", "email": "admin@bigpaw.com", "password": server.hash_password("admin123"), "role": "admin", "active": True, "createdAt": "2026-01-01T00:00:00.000Z"}
            ]
        }), encoding="utf-8")

        server.import_backup_file(backup_path)

        dogs = self._request_json("/api/dogs", None, method="GET", token=self._admin_token())
        self.assertTrue(any(item.get("name") == "Bella" for item in dogs), dogs)

        reports = self._request_json("/api/daily-reports", None, method="GET", token=self._admin_token())
        self.assertTrue(any(item.get("personInCharge") == "Jane" for item in reports), reports)

    def test_import_backup_file_reseeds_super_admin(self):
        backup_path = Path(self.temp_dir.name) / "import-backup-no-admin.json"
        backup_path.write_text(json.dumps({
            "dogs": [],
            "puppies": [],
            "users": [
                {"id": "u-staff-1", "name": "Staff", "email": "staff-only@example.com", "password": server.hash_password("staff123"), "role": "staff", "active": True, "createdAt": "2026-07-24T09:20:00Z"}
            ]
        }), encoding="utf-8")

        server.import_backup_file(backup_path)

        admin_login = self._request_json(
            "/api/auth/login",
            {"identifier": "admin@bigpaw.com", "password": "admin123"},
        )
        self.assertTrue(admin_login.get("ok"), admin_login)


if __name__ == "__main__":
    unittest.main()
