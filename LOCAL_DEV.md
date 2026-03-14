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

## 3. Common issues

- **404 on “Reset database”**  
  The backend is still running old code. Stop it (Ctrl+C) and start it again with the command above.

- **403 on `/tickets/...`**  
  Edit/Delete are only allowed for **manager** and **admin**. Log in as manager or admin (e.g. `manager@ppf.local` / `admin@ppf.local` with the seed passwords) to use those actions.

- **CORS errors in the browser**  
  The backend now adds CORS headers to all responses. Restart the backend so this change is active.

- **Chart “width(-1) height(-1)” warning**  
  Chart containers now use fixed heights so this warning should go away after a refresh.
