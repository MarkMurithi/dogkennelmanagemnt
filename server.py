import datetime
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "kennel.db"
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8001"))


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000).hex()
    return f"pbkdf2_sha256$200000${salt}${digest}"


def verify_password(stored_password, password):
    if not stored_password:
        return False
    if stored_password.startswith("pbkdf2_sha256$"):
        parts = stored_password.split("$")
        if len(parts) != 4:
            return False
        iterations = int(parts[1])
        salt = parts[2]
        expected = parts[3]
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations).hex()
        return hmac.compare_digest(digest, expected)
    return hmac.compare_digest(stored_password, password)


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'staff',
            active INTEGER DEFAULT 1,
            createdAt TEXT NOT NULL
        )
        """
    )
    try:
        conn.execute("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1")
    except sqlite3.OperationalError:
        pass
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS auth_tokens (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            revoked INTEGER DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS dogs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            breed TEXT,
            gender TEXT,
            dob TEXT,
            status TEXT,
            weight TEXT,
            notes TEXT,
            value TEXT,
            forSale INTEGER DEFAULT 0,
            price TEXT,
            image TEXT,
            records TEXT,
            attachments TEXT,
            createdAt TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS puppies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            dob TEXT,
            gender TEXT,
            saleStatus TEXT,
            saleTotalAmount REAL,
            saleReceivedAmount REAL,
            saleUnpaidAmount REAL,
            vaccinations TEXT,
            deworming TEXT,
            father TEXT,
            mother TEXT,
            sireGrandfather TEXT,
            sireGrandmother TEXT,
            damGrandfather TEXT,
            damGrandmother TEXT,
            ownerName TEXT,
            ownerPhone TEXT,
            ownerAddress TEXT,
            createdAt TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS finance (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            category TEXT,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            related TEXT,
            notes TEXT,
            createdAt TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            notes TEXT,
            createdAt TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS activities (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            text TEXT NOT NULL,
            color TEXT NOT NULL,
            time TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS backup_history (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            filePath TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'auto'
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            actor_id TEXT,
            actor_name TEXT,
            action TEXT NOT NULL,
            target TEXT,
            details TEXT,
            createdAt TEXT NOT NULL
        )
        """
    )
    conn.commit()

    admin_row = conn.execute("SELECT id FROM users WHERE LOWER(email) = ?", ("admin@bigpaw.com",)).fetchone()
    if admin_row is None:
        conn.execute(
            "INSERT INTO users (id, name, email, password, role, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("u-admin-1", "Admin User", "admin@bigpaw.com", hash_password("admin123"), "admin", 1, "2026-01-01T00:00:00.000Z"),
        )
    else:
        conn.execute(
            "UPDATE users SET password = ?, role = ?, active = 1 WHERE id = ?",
            (hash_password("admin123"), "admin", admin_row[0]),
        )
    conn.commit()
    conn.close()


class KennelHandler(BaseHTTPRequestHandler):
    def _hash_password(self, password):
        return hash_password(password)

    def _verify_password(self, stored_password, password):
        return verify_password(stored_password, password)

    def _issue_token(self, user_id):
        token = secrets.token_urlsafe(32)
        expires_at = self._now(datetime.datetime.utcnow() + datetime.timedelta(days=7))
        conn = self._connect()
        conn.execute("DELETE FROM auth_tokens WHERE user_id = ?", (user_id,))
        conn.execute(
            "INSERT INTO auth_tokens (token, user_id, createdAt, expiresAt, revoked) VALUES (?, ?, ?, ?, 0)",
            (token, user_id, self._now(), expires_at),
        )
        conn.commit()
        conn.close()
        return token

    def _revoke_token(self, token):
        conn = self._connect()
        conn.execute("UPDATE auth_tokens SET revoked = 1 WHERE token = ?", (token,))
        conn.commit()
        conn.close()

    def _get_bearer_token(self):
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None
        return auth_header.split(" ", 1)[1].strip()

    def _authenticate_user(self):
        token = self._get_bearer_token()
        if not token:
            return None
        conn = self._connect()
        row = conn.execute(
            "SELECT u.id, u.name, u.email, u.role FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ? AND t.revoked = 0 AND t.expiresAt > ?",
            (token, self._now()),
        ).fetchone()
        conn.close()
        if not row:
            return None
        return {"id": row[0], "name": row[1], "email": row[2], "role": row[3]}

    def _require_auth(self):
        user = self._authenticate_user()
        if not user:
            self._send_json(401, {"ok": False, "error": "Authentication required."})
            return None
        return user

    def _require_role(self, user, roles):
        if not user:
            self._send_json(401, {"ok": False, "error": "Authentication required."})
            return False
        if user.get("role") not in roles:
            self._send_json(403, {"ok": False, "error": "Access denied."})
            return False
        return True

    def _log_audit(self, actor, action, target=None, details=None):
        try:
            conn = self._connect()
            conn.execute(
                "INSERT INTO audit_logs (id, actor_id, actor_name, action, target, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    "al" + str(int(__import__("time").time() * 1000)),
                    actor.get("id") if actor else None,
                    actor.get("name") if actor else None,
                    action,
                    target,
                    details,
                    self._now(),
                ),
            )
            conn.commit()
            conn.close()
        except Exception:
            pass

    def _ensure_backup_dir(self):
        backup_dir = ROOT / "backups"
        backup_dir.mkdir(exist_ok=True)
        return backup_dir

    def _build_backup_payload(self):
        return {
            "generatedAt": self._now(),
            "label": "Auto-export",
            "source": "auto",
            "dogs": [
                {
                    "id": row[0],
                    "name": row[1],
                    "breed": row[2],
                    "gender": row[3],
                    "dob": row[4],
                    "status": row[5],
                    "weight": row[6],
                    "notes": row[7],
                    "value": row[8],
                    "forSale": bool(row[9]),
                    "price": row[10],
                    "image": row[11],
                    "records": json.loads(row[12]) if row[12] else {"health": [], "vaccination": [], "deworming": [], "breeding": [], "heatCycle": [], "training": []},
                    "attachments": json.loads(row[13]) if row[13] else [],
                    "createdAt": row[14],
                }
                for row in self._fetch_all("SELECT id, name, breed, gender, dob, status, weight, notes, value, forSale, price, image, records, attachments, createdAt FROM dogs ORDER BY createdAt DESC")
            ],
            "puppies": [
                {
                    "id": row[0],
                    "name": row[1],
                    "dob": row[2],
                    "gender": row[3],
                    "saleStatus": row[4],
                    "saleTotalAmount": row[5],
                    "saleReceivedAmount": row[6],
                    "saleUnpaidAmount": row[7],
                    "vaccinations": json.loads(row[8]) if row[8] else [],
                    "deworming": json.loads(row[9]) if row[9] else [],
                    "father": row[10],
                    "mother": row[11],
                    "sireGrandfather": row[12],
                    "sireGrandmother": row[13],
                    "damGrandfather": row[14],
                    "damGrandmother": row[15],
                    "ownerName": row[16],
                    "ownerPhone": row[17],
                    "ownerAddress": row[18],
                    "createdAt": row[19],
                }
                for row in self._fetch_all("SELECT id, name, dob, gender, saleStatus, saleTotalAmount, saleReceivedAmount, saleUnpaidAmount, vaccinations, deworming, father, mother, sireGrandfather, sireGrandmother, damGrandfather, damGrandmother, ownerName, ownerPhone, ownerAddress, createdAt FROM puppies ORDER BY createdAt DESC")
            ],
            "finance": [
                {"id": row[0], "type": row[1], "title": row[2], "category": row[3], "amount": row[4], "date": row[5], "related": row[6], "notes": row[7], "createdAt": row[8]}
                for row in self._fetch_all("SELECT id, type, title, category, amount, date, related, notes, createdAt FROM finance ORDER BY date DESC, createdAt DESC")
            ],
            "events": [
                {"id": row[0], "title": row[1], "date": row[2], "notes": row[3], "createdAt": row[4]}
                for row in self._fetch_all("SELECT id, title, date, notes, createdAt FROM events ORDER BY date ASC")
            ],
            "activities": [
                {"id": row[0], "type": row[1], "text": row[2], "color": row[3], "time": row[4]}
                for row in self._fetch_all("SELECT id, type, text, color, time FROM activities ORDER BY time DESC LIMIT 50")
            ],
            "users": [
                {"id": row[0], "name": row[1], "email": row[2], "password": row[3], "role": row[4], "active": bool(row[5]), "createdAt": row[6]}
                for row in self._fetch_all("SELECT id, name, email, password, role, active, createdAt FROM users ORDER BY createdAt DESC")
            ],
        }

    def _create_backup(self, label="Auto-export", source="auto"):
        backup_dir = self._ensure_backup_dir()
        backup_id = "bk" + str(int(__import__("time").time() * 1000))
        payload = self._build_backup_payload()
        payload["label"] = label
        payload["source"] = source
        file_name = f"{backup_id}.json"
        file_path = backup_dir / file_name
        snapshot = json.dumps(payload, indent=2)
        file_path.write_text(snapshot, encoding="utf-8")
        relative_path = str(file_path.relative_to(ROOT)).replace("\\", "/")
        conn = self._connect()
        conn.execute(
            "INSERT INTO backup_history (id, label, createdAt, filePath, snapshot, size, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (backup_id, label, self._now(), relative_path, snapshot, file_path.stat().st_size, source),
        )
        conn.commit()
        conn.close()
        return {"id": backup_id, "label": label, "createdAt": self._now(), "filePath": relative_path, "size": file_path.stat().st_size, "source": source}

    def _restore_backup(self, backup_id):
        conn = self._connect()
        row = conn.execute("SELECT snapshot FROM backup_history WHERE id = ?", (backup_id,)).fetchone()
        conn.close()
        if not row:
            return None
        try:
            payload = json.loads(row["snapshot"])
        except (TypeError, ValueError):
            return None
        conn = self._connect()
        conn.execute("DELETE FROM dogs")
        conn.execute("DELETE FROM puppies")
        conn.execute("DELETE FROM finance")
        conn.execute("DELETE FROM events")
        conn.execute("DELETE FROM activities")
        conn.execute("DELETE FROM users")
        for dog in payload.get("dogs", []):
            conn.execute(
                "INSERT INTO dogs (id, name, breed, gender, dob, status, weight, notes, value, forSale, price, image, records, attachments, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    dog.get("id") or "d" + str(int(__import__("time").time() * 1000)),
                    dog.get("name", ""),
                    dog.get("breed", ""),
                    dog.get("gender", "Unknown"),
                    dog.get("dob"),
                    dog.get("status", "Active"),
                    dog.get("weight", ""),
                    dog.get("notes", ""),
                    dog.get("value", ""),
                    int(bool(dog.get("forSale", False))),
                    dog.get("price", ""),
                    dog.get("image", ""),
                    json.dumps(dog.get("records") or {"health": [], "vaccination": [], "deworming": [], "breeding": [], "heatCycle": [], "training": []}),
                    json.dumps(dog.get("attachments") or []),
                    dog.get("createdAt") or self._now(),
                ),
            )
        for puppy in payload.get("puppies", []):
            conn.execute(
                "INSERT INTO puppies (id, name, dob, gender, saleStatus, saleTotalAmount, saleReceivedAmount, saleUnpaidAmount, vaccinations, deworming, father, mother, sireGrandfather, sireGrandmother, damGrandfather, damGrandmother, ownerName, ownerPhone, ownerAddress, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    puppy.get("id") or "p" + str(int(__import__("time").time() * 1000)),
                    puppy.get("name", ""),
                    puppy.get("dob"),
                    puppy.get("gender", "Unknown"),
                    puppy.get("saleStatus", "Available"),
                    puppy.get("saleTotalAmount"),
                    puppy.get("saleReceivedAmount"),
                    puppy.get("saleUnpaidAmount"),
                    json.dumps(puppy.get("vaccinations") or []),
                    json.dumps(puppy.get("deworming") or []),
                    puppy.get("father", ""),
                    puppy.get("mother", ""),
                    puppy.get("sireGrandfather", ""),
                    puppy.get("sireGrandmother", ""),
                    puppy.get("damGrandfather", ""),
                    puppy.get("damGrandmother", ""),
                    puppy.get("ownerName", ""),
                    puppy.get("ownerPhone", ""),
                    puppy.get("ownerAddress", ""),
                    puppy.get("createdAt") or self._now(),
                ),
            )
        for entry in payload.get("finance", []):
            conn.execute(
                "INSERT INTO finance (id, type, title, category, amount, date, related, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    entry.get("id") or "f" + str(int(__import__("time").time() * 1000)),
                    entry.get("type", "expense"),
                    entry.get("title", ""),
                    entry.get("category", ""),
                    entry.get("amount", 0),
                    entry.get("date", self._date()),
                    entry.get("related", ""),
                    entry.get("notes", ""),
                    entry.get("createdAt") or self._now(),
                ),
            )
        for event in payload.get("events", []):
            conn.execute(
                "INSERT INTO events (id, title, date, notes, createdAt) VALUES (?, ?, ?, ?, ?)",
                (
                    event.get("id") or "ev" + str(int(__import__("time").time() * 1000)),
                    event.get("title", ""),
                    event.get("date", self._date()),
                    event.get("notes", ""),
                    event.get("createdAt") or self._now(),
                ),
            )
        for activity in payload.get("activities", []):
            conn.execute(
                "INSERT INTO activities (id, type, text, color, time) VALUES (?, ?, ?, ?, ?)",
                (
                    activity.get("id") or "a" + str(int(__import__("time").time() * 1000)),
                    activity.get("type", "info"),
                    activity.get("text", ""),
                    activity.get("color", "blue"),
                    activity.get("time") or self._now(),
                ),
            )
        for user in payload.get("users", []):
            conn.execute(
                "INSERT INTO users (id, name, email, password, role, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    user.get("id") or "u" + str(int(__import__("time").time() * 1000)),
                    user.get("name", ""),
                    user.get("email", ""),
                    user.get("password") or self._hash_password("changeme"),
                    user.get("role", "staff"),
                    int(bool(user.get("active", True))),
                    user.get("createdAt") or self._now(),
                ),
            )
        conn.commit()
        conn.close()
        return payload

    def do_OPTIONS(self):
        self._send_json(204, None)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api"):
            self._handle_api(path, parsed.query, "GET", None)
            return
        self._serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api"):
            self._handle_api(path, parsed.query, "POST", self._read_body())
            return
        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api"):
            self._handle_api(path, parsed.query, "PUT", self._read_body())
            return
        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api"):
            self._handle_api(path, parsed.query, "DELETE", None)
            return
        self._send_json(404, {"ok": False, "error": "Not found"})

    def _handle_api(self, path, query, method, body):
        if path == "/api/health":
            self._send_json(200, {"ok": True, "message": "Bigpaw backend is running"})
            return

        if path == "/api/auth/me" and method == "GET":
            user = self._authenticate_user()
            if not user:
                self._send_json(401, {"ok": False, "error": "Authentication required."})
                return
            self._send_json(200, {"ok": True, "user": user})
            return

        if path == "/api/auth/logout" and method == "POST":
            token = self._get_bearer_token()
            if token:
                self._revoke_token(token)
            self._send_json(200, {"ok": True})
            return

        if path == "/api/audit-logs" and method in {"GET", "POST"}:
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            rows = self._fetch_all("SELECT id, actor_id, actor_name, action, target, details, createdAt FROM audit_logs ORDER BY createdAt DESC LIMIT 50")
            payload = [{"id": row[0], "actorId": row[1], "actorName": row[2], "action": row[3], "target": row[4], "details": row[5], "createdAt": row[6]} for row in rows]
            self._send_json(200, {"ok": True, "entries": payload})
            return

        if path == "/api/backups" and method == "GET":
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            rows = self._fetch_all("SELECT id, label, createdAt, filePath, size, source FROM backup_history ORDER BY createdAt DESC LIMIT 12")
            payload = [{"id": row[0], "label": row[1], "createdAt": row[2], "filePath": row[3], "size": row[4], "source": row[5]} for row in rows]
            self._send_json(200, payload)
            return

        if path == "/api/backups" and method == "POST":
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            payload = self._parse_json(body)
            label = str(payload.get("label", "")).strip() or "Manual backup"
            backup = self._create_backup(label=label, source="manual")
            self._send_json(200, {"ok": True, "backup": backup})
            return

        if path == "/api/backups/restore" and method == "POST":
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            payload = self._parse_json(body)
            backup_id = str(payload.get("backupId", "")).strip()
            if not backup_id:
                self._send_json(400, {"ok": False, "error": "A backup id is required."})
                return
            restored = self._restore_backup(backup_id)
            if not restored:
                self._send_json(404, {"ok": False, "error": "Backup not found."})
                return
            self._create_backup(label="Restore snapshot", source="restore")
            self._log_audit(user, "restore_backup", backup_id, f"Restored backup {backup_id}")
            self._send_json(200, {"ok": True, "message": "Backup restored successfully."})
            return

        if path == "/api/users" and method == "GET":
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            rows = self._fetch_all("SELECT id, name, email, role, active, createdAt FROM users ORDER BY createdAt DESC")
            payload = [{"id": row[0], "name": row[1], "email": row[2], "role": row[3], "active": bool(row[4]), "createdAt": row[5]} for row in rows]
            self._send_json(200, payload)
            return

        if path == "/api/users" and method == "POST":
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            payload = self._parse_json(body)
            name = str(payload.get("name", "")).strip()
            email = str(payload.get("email", "")).strip().lower()
            password = str(payload.get("password", ""))
            role = str(payload.get("role", "staff")).strip().lower() or "staff"
            active = bool(payload.get("active", True))
            if not name or not email or not password:
                self._send_json(400, {"ok": False, "error": "Please complete all fields."})
                return
            conn = self._connect()
            try:
                user_id = "u" + str(int(__import__("time").time() * 1000))
                conn.execute(
                    "INSERT INTO users (id, name, email, password, role, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (user_id, name, email, self._hash_password(password), role, int(active), self._now()),
                )
                conn.commit()
                row = conn.execute("SELECT id, name, email, role, active, createdAt FROM users WHERE id = ?", (user_id,)).fetchone()
                conn.close()
                self._create_backup(label="Auto-export", source="auto")
                self._log_audit(user, "create_user", user_id, f"Created user {name} ({email})")
                self._send_json(200, {"ok": True, "user": {"id": row[0], "name": row[1], "email": row[2], "role": row[3], "active": bool(row[4]), "createdAt": row[5]}})
            except sqlite3.IntegrityError:
                conn.close()
                self._send_json(400, {"ok": False, "error": "An account with this email already exists."})
            return

        if path.startswith("/api/users/") and method in {"PUT", "DELETE"}:
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            target_id = path.split("/", 3)[3]
            if method == "PUT":
                payload = self._parse_json(body)
                conn = self._connect()
                updates = []
                values = []
                if "name" in payload:
                    updates.append("name = ?")
                    values.append(str(payload.get("name", "")).strip())
                if "email" in payload:
                    updates.append("email = ?")
                    values.append(str(payload.get("email", "")).strip().lower())
                if "role" in payload:
                    updates.append("role = ?")
                    values.append(str(payload.get("role", "staff")).strip().lower() or "staff")
                if "active" in payload:
                    updates.append("active = ?")
                    values.append(int(bool(payload.get("active", True))))
                if "password" in payload and str(payload.get("password", "")).strip():
                    updates.append("password = ?")
                    values.append(self._hash_password(str(payload.get("password", "")).strip()))
                values.append(target_id)
                conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", values)
                conn.commit()
                row = conn.execute("SELECT id, name, email, role, active, createdAt FROM users WHERE id = ?", (target_id,)).fetchone()
                conn.close()
                self._create_backup(label="Auto-export", source="auto")
                self._log_audit(user, "update_user", target_id, f"Updated user {row[1] if row else target_id}")
                self._send_json(200, {"ok": True, "user": {"id": row[0], "name": row[1], "email": row[2], "role": row[3], "active": bool(row[4]), "createdAt": row[5]}})
                return
            conn = self._connect()
            conn.execute("DELETE FROM users WHERE id = ?", (target_id,))
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "delete_user", target_id, f"Deleted user {target_id}")
            self._send_json(200, {"ok": True})
            return

        if path == "/api/auth/login" and method == "POST":
            payload = self._parse_json(body)
            identifier = str(payload.get("identifier", "")).strip().lower()
            password = str(payload.get("password", ""))
            conn = self._connect()
            user = conn.execute(
                "SELECT * FROM users WHERE LOWER(email)=? OR LOWER(name)=?",
                (identifier, identifier),
            ).fetchone()
            conn.close()
            if not user or not self._verify_password(user[3], password):
                self._send_json(401, {"ok": False, "error": "Invalid email or password."})
                return
            if not bool(user[5]) and user[5] is not None:
                self._send_json(403, {"ok": False, "error": "This account has been disabled."})
                return
            if self._verify_password(user[3], password) and not user[3].startswith("pbkdf2_sha256$"):
                conn = self._connect()
                conn.execute("UPDATE users SET password = ? WHERE id = ?", (self._hash_password(password), user[0]))
                conn.commit()
                conn.close()
            token = self._issue_token(user[0])
            self._send_json(200, {"ok": True, "token": token, "user": {"id": user[0], "name": user[1], "email": user[2], "role": user[4]}})
            return

        if path == "/api/auth/signup" and method == "POST":
            payload = self._parse_json(body)
            name = str(payload.get("name", "")).strip()
            email = str(payload.get("email", "")).strip().lower()
            password = str(payload.get("password", ""))
            if not name or not email or not password:
                self._send_json(400, {"ok": False, "error": "Please complete all fields."})
                return
            conn = self._connect()
            try:
                user_id = "u" + str(int(__import__("time").time() * 1000))
                conn.execute(
                    "INSERT INTO users (id, name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
                    (user_id, name, email, self._hash_password(password), "staff", self._now()),
                )
                conn.commit()
                row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
                conn.close()
                token = self._issue_token(user_id)
                self._send_json(200, {"ok": True, "token": token, "user": {"id": row[0], "name": row[1], "email": row[2], "role": row[4]}})
            except sqlite3.IntegrityError:
                conn.close()
                self._send_json(400, {"ok": False, "error": "An account with this email already exists."})
            return

        if path == "/api/dogs" and method == "GET":
            user = self._require_auth()
            if not user:
                return
            rows = self._fetch_all("SELECT * FROM dogs ORDER BY createdAt DESC")
            dogs_payload = []
            for row in rows:
                dogs_payload.append({
                    "id": row[0],
                    "name": row[1],
                    "breed": row[2],
                    "gender": row[3],
                    "dob": row[4],
                    "status": row[5],
                    "weight": row[6],
                    "notes": row[7],
                    "value": row[8],
                    "forSale": bool(row[9]),
                    "price": row[10],
                    "image": row[11],
                    "records": json.loads(row[12]) if row[12] else {"health": [], "vaccination": [], "deworming": [], "breeding": [], "heatCycle": [], "training": []},
                    "attachments": json.loads(row[13]) if row[13] else [],
                    "createdAt": row[14],
                })
            self._send_json(200, dogs_payload)
            return

        if path == "/api/dogs" and method == "POST":
            user = self._require_auth()
            if not user:
                return
            if user.get("role") == "staff":
                self._send_json(403, {"ok": False, "error": "Access denied."})
                return
            payload = self._parse_json(body)
            name = str(payload.get("name", "")).strip()
            breed = str(payload.get("breed", "")).strip()
            gender = str(payload.get("gender", "Unknown")).strip() or "Unknown"
            if not name or not breed:
                self._send_json(400, {"ok": False, "error": "A dog name and breed are required."})
                return
            if not gender:
                self._send_json(400, {"ok": False, "error": "Please choose a gender for the dog."})
                return
            records = payload.get("records") or {"health": [], "vaccination": [], "deworming": [], "breeding": [], "heatCycle": [], "training": []}
            if not isinstance(records, dict):
                self._send_json(400, {"ok": False, "error": "Dog records must be provided as an object."})
                return
            for record_type, entries in records.items():
                if not isinstance(entries, list):
                    continue
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    date_field = "date"
                    if record_type == "heatCycle":
                        date_field = "startDate"
                    if record_type == "breeding" and not entry.get("expectedDate") and not entry.get("date"):
                        self._send_json(400, {"ok": False, "error": f"{record_type} records require a date."})
                        return
                    if not entry.get(date_field):
                        if record_type != "breeding":
                            self._send_json(400, {"ok": False, "error": f"{record_type} records require a date."})
                            return
            conn = self._connect()
            existing = conn.execute("SELECT id FROM dogs WHERE LOWER(name)=?", (name.lower(),)).fetchone()
            if existing:
                conn.close()
                self._send_json(409, {"ok": False, "error": "A dog with this name already exists."})
                return
            dog_id = payload.get("id") or "d" + str(int(__import__("time").time() * 1000))
            conn.execute(
                "INSERT INTO dogs (id, name, breed, gender, dob, status, weight, notes, value, forSale, price, image, records, attachments, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    dog_id,
                    name,
                    breed,
                    gender,
                    payload.get("dob"),
                    payload.get("status", "Active"),
                    payload.get("weight", ""),
                    payload.get("notes", ""),
                    payload.get("value", ""),
                    int(bool(payload.get("forSale", False))),
                    payload.get("price", ""),
                    payload.get("image", ""),
                    json.dumps(records),
                    json.dumps(payload.get("attachments") or []),
                    self._now(),
                ),
            )
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "create_dog", dog_id, f"Created dog {name}")
            self._send_json(200, {"ok": True, "dog": {**payload, "id": dog_id, "name": name, "breed": breed, "gender": gender}})
            return

        if path.startswith("/api/dogs/") and method in {"PUT", "DELETE"}:
            user = self._require_auth()
            if not user:
                return
            if user.get("role") == "staff":
                self._send_json(403, {"ok": False, "error": "Access denied."})
                return
            dog_id = path.split("/", 3)[3]
            if method == "PUT":
                payload = self._parse_json(body)
                name = str(payload.get("name", "")).strip()
                breed = str(payload.get("breed", "")).strip()
                gender = str(payload.get("gender", "Unknown")).strip() or "Unknown"
                if not name or not breed:
                    self._send_json(400, {"ok": False, "error": "A dog name and breed are required."})
                    return
                records = payload.get("records") or {"health": [], "vaccination": [], "deworming": [], "breeding": [], "heatCycle": [], "training": []}
                if not isinstance(records, dict):
                    self._send_json(400, {"ok": False, "error": "Dog records must be provided as an object."})
                    return
                for record_type, entries in records.items():
                    if not isinstance(entries, list):
                        continue
                    for entry in entries:
                        if not isinstance(entry, dict):
                            continue
                        date_field = "date"
                        if record_type == "heatCycle":
                            date_field = "startDate"
                        if record_type == "breeding" and not entry.get("expectedDate") and not entry.get("date"):
                            self._send_json(400, {"ok": False, "error": f"{record_type} records require a date."})
                            return
                        if not entry.get(date_field):
                            if record_type != "breeding":
                                self._send_json(400, {"ok": False, "error": f"{record_type} records require a date."})
                                return
                conn = self._connect()
                duplicate = conn.execute("SELECT id FROM dogs WHERE LOWER(name)=? AND id!=?", (name.lower(), dog_id)).fetchone()
                if duplicate:
                    conn.close()
                    self._send_json(409, {"ok": False, "error": "A dog with this name already exists."})
                    return
                conn.execute(
                    "UPDATE dogs SET name=?, breed=?, gender=?, dob=?, status=?, weight=?, notes=?, value=?, forSale=?, price=?, image=?, records=?, attachments=? WHERE id=?",
                    (
                        name,
                        breed,
                        gender,
                        payload.get("dob"),
                        payload.get("status", "Active"),
                        payload.get("weight", ""),
                        payload.get("notes", ""),
                        payload.get("value", ""),
                        int(bool(payload.get("forSale", False))),
                        payload.get("price", ""),
                        payload.get("image", ""),
                        json.dumps(records),
                        json.dumps(payload.get("attachments") or []),
                        dog_id,
                    ),
                )
                conn.commit()
                conn.close()
                self._create_backup(label="Auto-export", source="auto")
                self._log_audit(user, "update_dog", dog_id, f"Updated dog {name}")
                self._send_json(200, {"ok": True, "dog": {**payload, "name": name, "breed": breed, "gender": gender}})
                return
            conn = self._connect()
            conn.execute("DELETE FROM dogs WHERE id = ?", (dog_id,))
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "delete_dog", dog_id, f"Deleted dog {dog_id}")
            self._send_json(200, {"ok": True})
            return

        if path == "/api/puppies" and method == "GET":
            user = self._require_auth()
            if not user:
                return
            rows = self._fetch_all("SELECT * FROM puppies ORDER BY createdAt DESC")
            payload = []
            for row in rows:
                payload.append({
                    "id": row[0],
                    "name": row[1],
                    "dob": row[2],
                    "gender": row[3],
                    "saleStatus": row[4],
                    "saleTotalAmount": row[5],
                    "saleReceivedAmount": row[6],
                    "saleUnpaidAmount": row[7],
                    "vaccinations": json.loads(row[8]) if row[8] else [],
                    "deworming": json.loads(row[9]) if row[9] else [],
                    "father": row[10],
                    "mother": row[11],
                    "sireGrandfather": row[12],
                    "sireGrandmother": row[13],
                    "damGrandfather": row[14],
                    "damGrandmother": row[15],
                    "ownerName": row[16],
                    "ownerPhone": row[17],
                    "ownerAddress": row[18],
                    "createdAt": row[19],
                })
            self._send_json(200, payload)
            return

        if path == "/api/puppies" and method == "POST":
            user = self._require_auth()
            if not user:
                return
            payload = self._parse_json(body)
            name = str(payload.get("name", "")).strip()
            gender = str(payload.get("gender", "Unknown")).strip() or "Unknown"
            if not name:
                self._send_json(400, {"ok": False, "error": "A puppy name is required."})
                return
            if not gender:
                self._send_json(400, {"ok": False, "error": "Please choose a gender for the puppy."})
                return
            conn = self._connect()
            existing = conn.execute("SELECT id FROM puppies WHERE LOWER(name)=?", (name.lower(),)).fetchone()
            if existing:
                conn.close()
                self._send_json(409, {"ok": False, "error": "A puppy with this name already exists."})
                return
            puppy_id = payload.get("id") or "p" + str(int(__import__("time").time() * 1000))
            conn.execute(
                "INSERT INTO puppies (id, name, dob, gender, saleStatus, saleTotalAmount, saleReceivedAmount, saleUnpaidAmount, vaccinations, deworming, father, mother, sireGrandfather, sireGrandmother, damGrandfather, damGrandmother, ownerName, ownerPhone, ownerAddress, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    puppy_id,
                    name,
                    payload.get("dob"),
                    gender,
                    payload.get("saleStatus", "Available"),
                    payload.get("saleTotalAmount"),
                    payload.get("saleReceivedAmount"),
                    payload.get("saleUnpaidAmount"),
                    json.dumps(payload.get("vaccinations") or []),
                    json.dumps(payload.get("deworming") or []),
                    payload.get("father", ""),
                    payload.get("mother", ""),
                    payload.get("sireGrandfather", ""),
                    payload.get("sireGrandmother", ""),
                    payload.get("damGrandfather", ""),
                    payload.get("damGrandmother", ""),
                    payload.get("ownerName", ""),
                    payload.get("ownerPhone", ""),
                    payload.get("ownerAddress", ""),
                    self._now(),
                ),
            )
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._send_json(200, {"ok": True, "puppy": {**payload, "id": puppy_id, "name": name, "gender": gender}})
            return

        if path.startswith("/api/puppies/") and method == "DELETE":
            user = self._require_auth()
            if not user:
                return
            puppy_id = path.split("/", 3)[3]
            conn = self._connect()
            conn.execute("DELETE FROM puppies WHERE id = ?", (puppy_id,))
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._send_json(200, {"ok": True})
            return

        if path == "/api/finance" and method == "GET":
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            rows = self._fetch_all("SELECT * FROM finance ORDER BY date DESC, createdAt DESC")
            payload = [
                {"id": row[0], "type": row[1], "title": row[2], "category": row[3], "amount": row[4], "date": row[5], "related": row[6], "notes": row[7], "createdAt": row[8]}
                for row in rows
            ]
            self._send_json(200, payload)
            return

        if path == "/api/finance" and method == "POST":
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            payload = self._parse_json(body)
            title = str(payload.get("title", "")).strip()
            category = str(payload.get("category", "")).strip()
            amount = payload.get("amount")
            date_value = str(payload.get("date") or "").strip() or self._date()
            if not title:
                self._send_json(400, {"ok": False, "error": "A transaction title is required."})
                return
            if not category:
                self._send_json(400, {"ok": False, "error": "Please assign a category to the transaction."})
                return
            try:
                numeric_amount = float(amount)
            except (TypeError, ValueError):
                self._send_json(400, {"ok": False, "error": "Please enter a valid numeric amount."})
                return
            if numeric_amount <= 0:
                self._send_json(400, {"ok": False, "error": "The transaction amount must be greater than zero."})
                return
            entry_id = payload.get("id") or "f" + str(int(__import__("time").time() * 1000))
            conn = self._connect()
            conn.execute(
                "INSERT INTO finance (id, type, title, category, amount, date, related, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (entry_id, payload.get("type", "expense"), title, category, numeric_amount, date_value, payload.get("related", ""), payload.get("notes", ""), self._now()),
            )
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "create_finance", entry_id, f"Created finance entry {title}")
            self._send_json(200, {"ok": True, "entry": {**payload, "id": entry_id, "title": title, "category": category, "amount": numeric_amount, "date": date_value}})
            return

        if path.startswith("/api/finance/") and method == "DELETE":
            user = self._require_auth()
            if not self._require_role(user, {"admin"}):
                return
            entry_id = path.split("/", 3)[3]
            conn = self._connect()
            conn.execute("DELETE FROM finance WHERE id = ?", (entry_id,))
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "delete_finance", entry_id, f"Deleted finance entry {entry_id}")
            self._send_json(200, {"ok": True})
            return

        if path == "/api/events" and method == "GET":
            user = self._require_auth()
            if not user:
                return
            rows = self._fetch_all("SELECT * FROM events ORDER BY date ASC")
            payload = [{"id": row[0], "title": row[1], "date": row[2], "notes": row[3], "createdAt": row[4]} for row in rows]
            self._send_json(200, payload)
            return

        if path == "/api/events" and method == "POST":
            user = self._require_auth()
            if not user:
                return
            payload = self._parse_json(body)
            title = str(payload.get("title", "")).strip()
            date_value = str(payload.get("date", "")).strip()
            if not title:
                self._send_json(400, {"ok": False, "error": "An event title is required."})
                return
            if not date_value:
                self._send_json(400, {"ok": False, "error": "Please choose an event date."})
                return
            event_id = payload.get("id") or "ev" + str(int(__import__("time").time() * 1000))
            conn = self._connect()
            conn.execute("INSERT INTO events (id, title, date, notes, createdAt) VALUES (?, ?, ?, ?, ?)", (event_id, title, date_value, payload.get("notes", ""), self._now()))
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._send_json(200, {"ok": True, "event": {**payload, "id": event_id, "title": title, "date": date_value}})
            return

        if path.startswith("/api/events/") and method == "DELETE":
            user = self._require_auth()
            if not user:
                return
            event_id = path.split("/", 3)[3]
            conn = self._connect()
            conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._send_json(200, {"ok": True})
            return

        if path == "/api/activities" and method == "GET":
            user = self._require_auth()
            if not user:
                return
            rows = self._fetch_all("SELECT * FROM activities ORDER BY time DESC LIMIT 20")
            payload = [{"id": row[0], "type": row[1], "text": row[2], "color": row[3], "time": row[4]} for row in rows]
            self._send_json(200, payload)
            return

        if path == "/api/activities" and method == "POST":
            user = self._require_auth()
            if not user:
                return
            payload = self._parse_json(body)
            activity_id = payload.get("id") or "a" + str(int(__import__("time").time() * 1000))
            conn = self._connect()
            conn.execute("INSERT INTO activities (id, type, text, color, time) VALUES (?, ?, ?, ?, ?)", (activity_id, payload.get("type", "info"), payload.get("text", ""), payload.get("color", "blue"), payload.get("time") or self._now()))
            conn.commit()
            conn.close()
            self._send_json(200, {"ok": True, "activity": {**payload, "id": activity_id}})
            return

        self._send_json(404, {"ok": False, "error": "Not found"})

    def _serve_static(self, path):
        if path in {"", "/"}:
            target = ROOT / "index.html"
        else:
            target = (ROOT / path.lstrip("/")).resolve()
        if not target.exists() or not str(target).startswith(str(ROOT)):
            self._send_json(404, {"ok": False, "error": "Not found"})
            return
        content = target.read_bytes()
        content_type = self._mime_type(target)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        return body.decode("utf-8")

    def _parse_json(self, body):
        if not body:
            return {}
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}

    def _connect(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def _fetch_all(self, query):
        conn = self._connect()
        rows = conn.execute(query).fetchall()
        conn.close()
        return rows

    def _now(self, dt=None):
        if dt is None:
            dt = datetime.datetime.utcnow()
        if isinstance(dt, datetime.datetime):
            return dt.isoformat() + "Z"
        return str(dt)

    def _date(self):
        import datetime
        return datetime.datetime.utcnow().date().isoformat()

    def _mime_type(self, path):
        ext = path.suffix.lower()
        mapping = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
        }
        return mapping.get(ext, "application/octet-stream")

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), KennelHandler)
    print(f"Bigpaw backend running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
