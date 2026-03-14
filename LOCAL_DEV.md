# Running locally (no need to push to Git)

You can run everything on your machine without pushing to Git or deploying.

## 1. Backend (Terminal 1)

```bash
cd PPF-Rejection-Portal/backend
source .venv/bin/activate   # or: .venv\Scripts\activate on Windows
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Important:** After pulling new code (e.g. admin reset-db, CORS fixes), **restart this** so the backend loads the latest routes.

## 2. Frontend (Terminal 2)

```bash
cd PPF-Rejection-Portal/frontend
npm run dev
```

Open **http://localhost:5173**. The app uses **http://localhost:8000** for the API when `VITE_API_BASE_URL` is not set; if you use a `.env` with `VITE_API_BASE_URL=http://localhost:8000`, that’s the same for local dev.

