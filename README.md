# Oikonomos

Oikonomos is now split into two projects:

- `backend`: Python 3 + FastAPI + sqlite3
- `frontend`: React + Material UI + Zustand (Vite + npm)

The tool stores data in:

- data directory: `~/.oikonomos`
- database file: `~/.oikonomos/data.db`

## Run Backend

```bash
cd backend
pip install -r requirements.txt
python run.py
```

Optional backend runtime env vars:

- `OIKONOMOS_BACKEND_HOST` (default `127.0.0.1`)
- `OIKONOMOS_BACKEND_PORT` (default `8000`)
- `OIKONOMOS_BACKEND_RELOAD` (default `true`)

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server runs on `http://localhost:9731` and proxies `/api` to `http://localhost:8000`.

## Authentication

The backend seeds a default admin user on startup (if it does not exist yet).

- default email: `admin@oikonomos.local`
- default password: `ChangeMe123!`

You should override these with environment variables:

- `OIKONOMOS_DEFAULT_ADMIN_EMAIL`
- `OIKONOMOS_DEFAULT_ADMIN_PASSWORD`
- `OIKONOMOS_JWT_SECRET`
- `OIKONOMOS_ACCESS_TOKEN_TTL_MINUTES` (default `15`)
- `OIKONOMOS_REFRESH_TOKEN_TTL_DAYS` (default `30`)
