import os
import sqlite3
from pathlib import Path


class DatabaseOperationalError(Exception):
    pass


class DatabaseIntegrityError(Exception):
    pass


class DBRow:
    def __init__(self, columns, values):
        self._columns = list(columns)
        self._values = tuple(values)
        self._mapping = {column: self._values[index] for index, column in enumerate(self._columns)}

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return self._mapping[key]

    def get(self, key, default=None):
        return self._mapping.get(key, default)


class DBCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def _columns(self):
        description = self._cursor.description or []
        return [getattr(item, "name", item[0]) for item in description]

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return DBRow(self._columns(), row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        columns = self._columns()
        return [DBRow(columns, row) for row in rows]


class DBConnection:
    def __init__(self, backend, native_connection, psycopg_module=None):
        self.backend = backend
        self._native_connection = native_connection
        self._psycopg = psycopg_module

    def _translate_query(self, query):
        if self.backend == "postgres":
            return query.replace("?", "%s")
        return query

    def _wrap_error(self, exc):
        if isinstance(exc, sqlite3.IntegrityError):
            raise DatabaseIntegrityError(str(exc)) from exc
        if isinstance(exc, sqlite3.OperationalError):
            raise DatabaseOperationalError(str(exc)) from exc
        if self._psycopg is not None and isinstance(exc, self._psycopg.IntegrityError):
            raise DatabaseIntegrityError(str(exc)) from exc
        if self._psycopg is not None and isinstance(exc, self._psycopg.OperationalError):
            raise DatabaseOperationalError(str(exc)) from exc
        raise exc

    def execute(self, query, params=()):
        try:
            cursor = self._native_connection.execute(self._translate_query(query), tuple(params or ()))
            return DBCursor(cursor)
        except Exception as exc:
            self._wrap_error(exc)

    def commit(self):
        self._native_connection.commit()

    def rollback(self):
        self._native_connection.rollback()

    def close(self):
        self._native_connection.close()


def get_database_url():
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if database_url.startswith("postgres://"):
        return "postgresql://" + database_url[len("postgres://"):]
    return database_url


def connect_database(db_path):
    database_url = get_database_url()
    if database_url:
        try:
            import psycopg
        except ModuleNotFoundError as exc:
            raise RuntimeError("DATABASE_URL is set, but psycopg is not installed. Add psycopg[binary] to requirements.") from exc
        native_connection = psycopg.connect(database_url)
        return DBConnection("postgres", native_connection, psycopg_module=psycopg)

    db_file = Path(db_path)
    db_file.parent.mkdir(parents=True, exist_ok=True)
    native_connection = sqlite3.connect(db_file)
    return DBConnection("sqlite", native_connection)