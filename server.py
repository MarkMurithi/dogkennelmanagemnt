import datetime
import hashlib
import hmac
import json
import os
import secrets
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from db_backend import DatabaseIntegrityError, DatabaseOperationalError, connect_database

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "kennel.db"
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8001"))
SUPER_ADMIN_EMAIL = "admin@bigpaw.com"


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
    conn = connect_database(DB_PATH)
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
    conn.commit()
    try:
        conn.execute("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1")
    except Exception as exc:
        # SQLite/Postgres differ in error classes for duplicate columns; ignore this safe migration case.
        conn.rollback()
        if "duplicate column" not in str(exc).lower() and "already exists" not in str(exc).lower():
            raise
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
        CREATE TABLE IF NOT EXISTS daily_reports (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            foodRemaining TEXT,
            foodToday TEXT,
            kennelsWashed INTEGER DEFAULT 0,
            dogStatuses TEXT,
            visitors TEXT,
            personInCharge TEXT,
            medicationNotes TEXT,
            cleaningChecklist TEXT,
            staffComments TEXT,
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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_approvals (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            action TEXT NOT NULL DEFAULT 'create',
            payload TEXT NOT NULL,
            actor_id TEXT,
            actor_name TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            createdAt TEXT NOT NULL,
            reviewedAt TEXT,
            reviewedBy TEXT,
            reviewNotes TEXT
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


def restore_backup_payload(payload):
    conn = connect_database(DB_PATH)
    conn.execute("DELETE FROM auth_tokens")
    conn.execute("DELETE FROM pending_approvals")
    conn.execute("DELETE FROM audit_logs")
    conn.execute("DELETE FROM daily_reports")
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
                dog.get("createdAt") or datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
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
                puppy.get("createdAt") or datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
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
                entry.get("date", datetime.datetime.now(datetime.UTC).date().isoformat()),
                entry.get("related", ""),
                entry.get("notes", ""),
                entry.get("createdAt") or datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
            ),
        )
    for event in payload.get("events", []):
        conn.execute(
            "INSERT INTO events (id, title, date, notes, createdAt) VALUES (?, ?, ?, ?, ?)",
            (
                event.get("id") or "ev" + str(int(__import__("time").time() * 1000)),
                event.get("title", ""),
                event.get("date", datetime.datetime.now(datetime.UTC).date().isoformat()),
                event.get("notes", ""),
                event.get("createdAt") or datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
            ),
        )
    for report in payload.get("dailyReports", []) or payload.get("daily_reports", []):
        conn.execute(
            "INSERT INTO daily_reports (id, date, foodRemaining, foodToday, kennelsWashed, dogStatuses, visitors, personInCharge, medicationNotes, cleaningChecklist, staffComments, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                report.get("id") or "dr" + str(int(__import__("time").time() * 1000)),
                report.get("date", datetime.datetime.now(datetime.UTC).date().isoformat()),
                report.get("foodRemaining", ""),
                report.get("foodToday", ""),
                int(bool(report.get("kennelsWashed", False))),
                json.dumps(report.get("dogStatuses") or []),
                report.get("visitors", ""),
                report.get("personInCharge", ""),
                report.get("medicationNotes", ""),
                report.get("cleaningChecklist", ""),
                report.get("staffComments", ""),
                report.get("notes", ""),
                report.get("createdAt") or datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
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
                activity.get("time") or datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
            ),
        )
    for user in payload.get("users", []):
        conn.execute(
            "INSERT INTO users (id, name, email, password, role, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                user.get("id") or "u" + str(int(__import__("time").time() * 1000)),
                user.get("name", ""),
                user.get("email", ""),
                user.get("password") or hash_password("changeme"),
                user.get("role", "staff"),
                int(bool(user.get("active", True))),
                user.get("createdAt") or datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
            ),
        )
    conn.commit()
    conn.close()
    return payload


def import_backup_file(file_path):
    backup_path = Path(file_path)
    payload = json.loads(backup_path.read_text(encoding="utf-8"))
    return restore_backup_payload(payload)


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

    def _is_super_admin(self, user):
        return bool(user) and str(user.get("email", "")).strip().lower() == SUPER_ADMIN_EMAIL

    def _normalize_role(self, role):
        normalized = str(role or "staff").strip().lower() or "staff"
        if normalized not in {"staff", "reviewer", "admin"}:
            return "staff"
        return normalized

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

    def _create_pending_approval(self, actor, entity_type, payload, action="create"):
        approval_id = "pa" + str(int(__import__("time").time() * 1000))
        conn = self._connect()
        conn.execute(
            "INSERT INTO pending_approvals (id, entity_type, action, payload, actor_id, actor_name, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                approval_id,
                entity_type,
                action,
                json.dumps(payload),
                actor.get("id") if actor else None,
                actor.get("name") if actor else None,
                "pending",
                self._now(),
            ),
        )
        conn.commit()
        conn.close()
        return approval_id

    def _apply_pending_approval(self, approval_row):
        payload = json.loads(approval_row["payload"]) if approval_row["payload"] else {}
        entity_type = approval_row["entity_type"]
        if entity_type == "dog":
            return self._insert_dog_record(payload)
        if entity_type == "puppy":
            return self._insert_puppy_record(payload)
        if entity_type == "finance":
            return self._insert_finance_record(payload)
        if entity_type == "event":
            return self._insert_event_record(payload)
        return None

    def _insert_dog_record(self, payload):
        name = str(payload.get("name", "")).strip()
        breed = str(payload.get("breed", "")).strip()
        gender = str(payload.get("gender", "Unknown")).strip() or "Unknown"
        if not name or not breed:
            raise ValueError("A dog name and breed are required.")
        if not gender:
            raise ValueError("Please choose a gender for the dog.")
        records = payload.get("records") or {"health": [], "vaccination": [], "deworming": [], "breeding": [], "heatCycle": [], "training": []}
        if not isinstance(records, dict):
            raise ValueError("Dog records must be provided as an object.")
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
                    raise ValueError(f"{record_type} records require a date.")
                if not entry.get(date_field):
                    if record_type != "breeding":
                        raise ValueError(f"{record_type} records require a date.")
        conn = self._connect()
        existing = conn.execute("SELECT id FROM dogs WHERE LOWER(name)=?", (name.lower(),)).fetchone()
        if existing:
            conn.close()
            raise ValueError("A dog with this name already exists.")
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
        return {"id": dog_id, "name": name, "breed": breed, "gender": gender}

    def _insert_puppy_record(self, payload):
        name = str(payload.get("name", "")).strip()
        gender = str(payload.get("gender", "Unknown")).strip() or "Unknown"
        if not name:
            raise ValueError("A puppy name is required.")
        if not gender:
            raise ValueError("Please choose a gender for the puppy.")
        conn = self._connect()
        existing = conn.execute("SELECT id FROM puppies WHERE LOWER(name)=?", (name.lower(),)).fetchone()
        if existing:
            conn.close()
            raise ValueError("A puppy with this name already exists.")
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
        return {"id": puppy_id, "name": name, "gender": gender}

    def _insert_finance_record(self, payload):
        title = str(payload.get("title", "")).strip()
        category = str(payload.get("category", "")).strip()
        amount = payload.get("amount")
        date_value = str(payload.get("date") or "").strip() or self._date()
        if not title:
            raise ValueError("A transaction title is required.")
        if not category:
            raise ValueError("Please assign a category to the transaction.")
        try:
            numeric_amount = float(amount)
        except (TypeError, ValueError):
            raise ValueError("Please enter a valid numeric amount.")
        if numeric_amount <= 0:
            raise ValueError("The transaction amount must be greater than zero.")
        entry_id = payload.get("id") or "f" + str(int(__import__("time").time() * 1000))
        conn = self._connect()
        conn.execute(
            "INSERT INTO finance (id, type, title, category, amount, date, related, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (entry_id, payload.get("type", "expense"), title, category, numeric_amount, date_value, payload.get("related", ""), payload.get("notes", ""), self._now()),
        )
        conn.commit()
        conn.close()
        return {"id": entry_id, "title": title, "category": category, "amount": numeric_amount, "date": date_value}

    def _insert_event_record(self, payload):
        title = str(payload.get("title", "")).strip()
        date_value = str(payload.get("date", "")).strip()
        if not title:
            raise ValueError("An event title is required.")
        if not date_value:
            raise ValueError("Please choose an event date.")
        event_id = payload.get("id") or "ev" + str(int(__import__("time").time() * 1000))
        conn = self._connect()
        conn.execute("INSERT INTO events (id, title, date, notes, createdAt) VALUES (?, ?, ?, ?, ?)", (event_id, title, date_value, payload.get("notes", ""), self._now()))
        conn.commit()
        conn.close()
        return {"id": event_id, "title": title, "date": date_value}

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
            "dailyReports": [
                {
                    "id": row[0],
                    "date": row[1],
                    "foodRemaining": row[2],
                    "foodToday": row[3],
                    "kennelsWashed": bool(row[4]),
                    "dogStatuses": json.loads(row[5]) if row[5] else [],
                    "visitors": row[6],
                    "personInCharge": row[7],
                    "medicationNotes": row[8],
                    "cleaningChecklist": row[9],
                    "staffComments": row[10],
                    "notes": row[11],
                    "createdAt": row[12],
                }
                for row in self._fetch_all("SELECT id, date, foodRemaining, foodToday, kennelsWashed, dogStatuses, visitors, personInCharge, medicationNotes, cleaningChecklist, staffComments, notes, createdAt FROM daily_reports ORDER BY date DESC, createdAt DESC")
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
        return restore_backup_payload(payload)

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

        if path == "/api/pending-approvals" and method == "GET":
            user = self._require_auth()
            if not self._require_role(user, {"admin", "reviewer"}):
                return
            rows = self._fetch_all("SELECT id, entity_type, action, payload, actor_id, actor_name, status, createdAt, reviewedAt, reviewedBy, reviewNotes FROM pending_approvals WHERE status = 'pending' ORDER BY createdAt DESC")
            payload = []
            for row in rows:
                payload.append({
                    "id": row[0],
                    "entityType": row[1],
                    "action": row[2],
                    "payload": json.loads(row[3]) if row[3] else {},
                    "actorId": row[4],
                    "actorName": row[5],
                    "status": row[6],
                    "createdAt": row[7],
                    "reviewedAt": row[8],
                    "reviewedBy": row[9],
                    "reviewNotes": row[10],
                })
            self._send_json(200, {"ok": True, "items": payload})
            return

        if path.startswith("/api/pending-approvals/") and path.endswith("/approve") and method == "POST":
            user = self._require_auth()
            if not self._require_role(user, {"admin", "reviewer"}):
                return
            approval_id = path.split("/", 4)[3]
            conn = self._connect()
            row = conn.execute("SELECT id, entity_type, payload FROM pending_approvals WHERE id = ? AND status = 'pending'", (approval_id,)).fetchone()
            if not row:
                conn.close()
                self._send_json(404, {"ok": False, "error": "Pending approval not found."})
                return
            try:
                result = self._apply_pending_approval(row)
            except ValueError as exc:
                conn.close()
                self._send_json(400, {"ok": False, "error": str(exc)})
                return
            conn.execute("UPDATE pending_approvals SET status = ?, reviewedAt = ?, reviewedBy = ?, reviewNotes = ? WHERE id = ?", ("approved", self._now(), user.get("id"), "Approved", approval_id))
            conn.commit()
            conn.close()
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "approve_pending", approval_id, f"Approved pending approval {approval_id}")
            self._send_json(200, {"ok": True, "result": result})
            return

        if path.startswith("/api/pending-approvals/") and path.endswith("/reject") and method == "POST":
            user = self._require_auth()
            if not self._require_role(user, {"admin", "reviewer"}):
                return
            approval_id = path.split("/", 4)[3]
            payload = self._parse_json(body)
            notes = str(payload.get("notes", "Rejected")).strip() or "Rejected"
            conn = self._connect()
            conn.execute("UPDATE pending_approvals SET status = ?, reviewedAt = ?, reviewedBy = ?, reviewNotes = ? WHERE id = ?", ("rejected", self._now(), user.get("id"), notes, approval_id))
            conn.commit()
            conn.close()
            self._log_audit(user, "reject_pending", approval_id, f"Rejected pending approval {approval_id}")
            self._send_json(200, {"ok": True})
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
            role = self._normalize_role(payload.get("role", "staff"))
            active = bool(payload.get("active", True))
            if not name or not email or not password:
                self._send_json(400, {"ok": False, "error": "Please complete all fields."})
                return
            if role == "admin":
                if not self._is_super_admin(user):
                    self._send_json(403, {"ok": False, "error": "Only the super admin can assign the admin role."})
                    return
                if email != SUPER_ADMIN_EMAIL:
                    self._send_json(403, {"ok": False, "error": "Only the super admin account may use the admin role."})
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
            except DatabaseIntegrityError:
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
                    requested_role = self._normalize_role(payload.get("role", "staff"))
                    if requested_role == "admin":
                        if not self._is_super_admin(user):
                            conn.close()
                            self._send_json(403, {"ok": False, "error": "Only the super admin can assign the admin role."})
                            return
                        existing_user = conn.execute("SELECT email FROM users WHERE id = ?", (target_id,)).fetchone()
                        if not existing_user or str(existing_user[0]).strip().lower() != SUPER_ADMIN_EMAIL:
                            conn.close()
                            self._send_json(403, {"ok": False, "error": "Only the super admin account may use the admin role."})
                            return
                    updates.append("role = ?")
                    values.append(requested_role)
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
            except DatabaseIntegrityError:
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
            payload = self._parse_json(body)
            if user.get("role") == "staff":
                try:
                    approval_id = self._create_pending_approval(user, "dog", payload)
                except Exception:
                    approval_id = None
                if approval_id:
                    self._log_audit(user, "submit_pending_dog", approval_id, f"Submitted dog for approval: {payload.get('name', '')}")
                    self._send_json(200, {"ok": True, "pending": True, "approvalId": approval_id, "message": "Your update has been submitted for admin approval."})
                    return
                self._send_json(500, {"ok": False, "error": "Unable to queue dog for approval."})
                return
            try:
                created = self._insert_dog_record(payload)
            except ValueError as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
                return
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "create_dog", created.get("id"), f"Created dog {created.get('name')}")
            self._send_json(200, {"ok": True, "dog": {**payload, **created}})
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
            if user.get("role") == "staff":
                approval_id = self._create_pending_approval(user, "puppy", payload)
                self._log_audit(user, "submit_pending_puppy", approval_id, f"Submitted puppy for approval: {payload.get('name', '')}")
                self._send_json(200, {"ok": True, "pending": True, "approvalId": approval_id, "message": "Your update has been submitted for admin approval."})
                return
            try:
                created = self._insert_puppy_record(payload)
            except ValueError as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
                return
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "create_puppy", created.get("id"), f"Created puppy {created.get('name')}")
            self._send_json(200, {"ok": True, "puppy": {**payload, **created}})
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
            if not self._require_role(user, {"admin", "reviewer"}):
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
            if not user:
                return
            if user.get("role") == "staff":
                approval_id = self._create_pending_approval(user, "finance", self._parse_json(body))
                self._log_audit(user, "submit_pending_finance", approval_id, f"Submitted finance entry for approval")
                self._send_json(200, {"ok": True, "pending": True, "approvalId": approval_id, "message": "Your update has been submitted for admin approval."})
                return
            if not self._require_role(user, {"admin"}):
                return
            payload = self._parse_json(body)
            try:
                created = self._insert_finance_record(payload)
            except ValueError as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
                return
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "create_finance", created.get("id"), f"Created finance entry {created.get('title')}")
            self._send_json(200, {"ok": True, "entry": {**payload, **created}})
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

        if path == "/api/daily-reports" and method == "GET":
            user = self._require_auth()
            if not user:
                return
            rows = self._fetch_all("SELECT * FROM daily_reports ORDER BY date DESC, createdAt DESC")
            payload = []
            for row in rows:
                payload.append({
                    "id": row[0],
                    "date": row[1],
                    "foodRemaining": row[2],
                    "foodToday": row[3],
                    "kennelsWashed": bool(row[4]),
                    "dogStatuses": json.loads(row[5]) if row[5] else [],
                    "visitors": row[6],
                    "personInCharge": row[7],
                    "medicationNotes": row[8],
                    "cleaningChecklist": row[9],
                    "staffComments": row[10],
                    "notes": row[11],
                    "createdAt": row[12],
                })
            self._send_json(200, payload)
            return

        if path == "/api/daily-reports" and method == "POST":
            user = self._require_auth()
            if not user:
                return
            payload = self._parse_json(body)
            date_value = str(payload.get("date", "")).strip()
            if not date_value:
                self._send_json(400, {"ok": False, "error": "A report date is required."})
                return
            report_id = "dr" + str(int(__import__("time").time() * 1000))
            dog_statuses = payload.get("dogStatuses") or []
            if not isinstance(dog_statuses, list):
                dog_statuses = []
            conn = self._connect()
            conn.execute(
                "INSERT INTO daily_reports (id, date, foodRemaining, foodToday, kennelsWashed, dogStatuses, visitors, personInCharge, medicationNotes, cleaningChecklist, staffComments, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    report_id,
                    date_value,
                    payload.get("foodRemaining", ""),
                    payload.get("foodToday", ""),
                    int(bool(payload.get("kennelsWashed", False))),
                    json.dumps(dog_statuses),
                    payload.get("visitors", ""),
                    payload.get("personInCharge", ""),
                    payload.get("medicationNotes", ""),
                    payload.get("cleaningChecklist", ""),
                    payload.get("staffComments", ""),
                    payload.get("notes", ""),
                    self._now(),
                ),
            )
            conn.commit()
            conn.close()
            self._log_audit(user, "create_daily_report", report_id, f"Created daily report for {date_value}")
            self._send_json(200, {"ok": True, "report": {
                "id": report_id,
                "date": date_value,
                "foodRemaining": payload.get("foodRemaining", ""),
                "foodToday": payload.get("foodToday", ""),
                "kennelsWashed": bool(payload.get("kennelsWashed", False)),
                "dogStatuses": dog_statuses,
                "visitors": payload.get("visitors", ""),
                "personInCharge": payload.get("personInCharge", ""),
                "medicationNotes": payload.get("medicationNotes", ""),
                "cleaningChecklist": payload.get("cleaningChecklist", ""),
                "staffComments": payload.get("staffComments", ""),
                "notes": payload.get("notes", ""),
                "createdAt": self._now(),
            }})
            return

        if path == "/api/events" and method == "POST":
            user = self._require_auth()
            if not user:
                return
            payload = self._parse_json(body)
            if user.get("role") == "staff":
                approval_id = self._create_pending_approval(user, "event", payload)
                self._log_audit(user, "submit_pending_event", approval_id, f"Submitted event for approval")
                self._send_json(200, {"ok": True, "pending": True, "approvalId": approval_id, "message": "Your update has been submitted for admin approval."})
                return
            try:
                created = self._insert_event_record(payload)
            except ValueError as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
                return
            self._create_backup(label="Auto-export", source="auto")
            self._log_audit(user, "create_event", created.get("id"), f"Created event {created.get('title')}")
            self._send_json(200, {"ok": True, "event": {**payload, **created}})
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
        return connect_database(DB_PATH)

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
    if len(sys.argv) >= 3 and sys.argv[1] == "--import-backup":
        init_db()
        imported = import_backup_file(sys.argv[2])
        print(f"Imported backup from {sys.argv[2]} with {len(imported.get('dogs', []))} dogs and {len(imported.get('puppies', []))} puppies.")
        sys.exit(0)
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), KennelHandler)
    print(f"Bigpaw backend running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
