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
uvicorn app.main:app --reload --port 8000
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server runs on `http://localhost:9731` and proxies `/api` to `http://localhost:8000`.
