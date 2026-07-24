import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib import error, request

import server


class DailyReportTests(unittest.TestCase):
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

    def test_daily_reports_can_be_created_and_fetched(self):
        login_result = self._request_json(
            "/api/auth/login",
            {"identifier": "admin@bigpaw.com", "password": "admin123"},
        )
        self.assertTrue(login_result.get("ok"), login_result)
        token = login_result.get("token")

        create_result = self._request_json(
            "/api/daily-reports",
            {
                "date": "2026-07-23",
                "foodRemaining": "Moderate",
                "foodToday": "Chicken and rice",
                "kennelsWashed": True,
                "dogStatuses": [{"dogId": "d1", "dogName": "Max", "healthStatus": "Good", "groomingStatus": "Clean"}],
                "puppyStatuses": [{"puppyId": "p1", "puppyName": "Tiny", "healthStatus": "Healthy"}],
                "visitors": "Two visitors",
                "personInCharge": "Mina",
                "medicationNotes": "Give meds at noon",
                "cleaningChecklist": "Water bowls, play area",
                "staffComments": "Busy morning but everything stayed calm",
                "notes": "All good",
            },
            token=token,
        )

        self.assertTrue(create_result.get("ok"), create_result)
        self.assertTrue(create_result.get("report", {}).get("id"))

        list_result = self._request_json("/api/daily-reports", method="GET", token=token)
        self.assertTrue(isinstance(list_result, list), list_result)
        self.assertEqual(len(list_result), 1)
        self.assertEqual(list_result[0]["foodRemaining"], "Moderate")
        self.assertEqual(list_result[0]["medicationNotes"], "Give meds at noon")
        self.assertEqual(list_result[0]["cleaningChecklist"], "Water bowls, play area")
        self.assertEqual(list_result[0]["staffComments"], "Busy morning but everything stayed calm")
        self.assertEqual(list_result[0]["puppyStatuses"][0]["puppyName"], "Tiny")
        self.assertEqual(list_result[0]["puppyStatuses"][0]["healthStatus"], "Healthy")


if __name__ == "__main__":
    unittest.main()
