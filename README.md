# Bigpaw Kennel Management

A polished kennel-management web app with dog and puppy management, health and breeding tracking, finance, calendar events, reporting, backup/restore support, and a database-backed backend.

## Repository

- **GitHub:** https://github.com/MarkMurithi/dogkennelmanagemnt

## Run locally

```bash
python server.py
```

Then open http://127.0.0.1:8001/.

## Default admin

- Email: `admin@bigpaw.com` (or `SUPER_ADMIN_EMAIL` if set)
- Password: `admin123` only on first bootstrap when `SUPER_ADMIN_BOOTSTRAP_PASSWORD` is not set.

## Required production environment variables

- `SUPER_ADMIN_BOOTSTRAP_PASSWORD`: required for secure first admin bootstrap.
- `CORS_ALLOWED_ORIGINS`: comma-separated allowed origins (for example `https://your-domain.com`).
- `DATABASE_URL`: Postgres connection string for hosted persistence.

## Security notes

- The super admin account is created only when missing and is no longer force-reset on every restart.
- Always set a strong `SUPER_ADMIN_BOOTSTRAP_PASSWORD` before first production start.
- Keep `CORS_ALLOWED_ORIGINS` restricted to your real frontend domain(s).

## Deployment notes

- The app is configured to run with Python on platforms like Render or Railway.
- Use the included Procfile to start the server.
- Set the PORT environment variable as required by the hosting platform.
- For shared, always-available hosted data, set `DATABASE_URL` to a Postgres database.
- The included `render.yaml` is configured to attach a Render Postgres database to the web service.
- If `DATABASE_URL` is not set, the server falls back to the local SQLite file at `data/kennel.db` for local development and tests.
