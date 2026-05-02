# Supabase backup with `pg_dump` (step by step)

This guide is for backing up **the whole Postgres database** Supabase hosts for your project — separate from the app’s **Admin → Download backup ZIP** (CSV export).

**Why bother:** CSV exports are easy to open in spreadsheets but do **not** replace a full database copy. **`pg_dump`** produces a file you can restore with **`pg_restore`** (or replay SQL), including schema and password hashes — best safety net if the database is corrupted or accidentally cleared.

---

## What you install on your computer

1. **PostgreSQL client tools** (they include `pg_dump`):

   **macOS (Homebrew)**

   ```bash
   brew install libpq
   brew link libpq --force
   ```

   Or install **Postgres.app** and use its bundled `pg_dump`.

   **Windows**

   - Install PostgreSQL from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)  
   - Add the `bin` folder (where `pg_dump.exe` lives) to your PATH.

   **Linux**

   ```bash
   sudo apt install postgresql-client
   ```

2. Confirm it works:

   ```bash
   pg_dump --version
   ```

---

## Where Supabase hides the connection string

3. Sign in at [supabase.com](https://supabase.com) and open your **project**.

4. Go **Project Settings** (gear) → **Database**.

5. Find **Connection string** / **URI** (sometimes labeled **“Session mode”** or **direct** connection):

   - It looks like:  
     `postgresql://postgres.[ref]:YOUR_PASSWORD@aws-...pooler.supabase.com:6543/postgres`  
     or similar with host **db.[project-ref].supabase.co** on port **5432**.

**Important:**

- **`pg_dump` generally needs a real session-capable Postgres connection.**  
  If one URL fails (timeouts, TLS, or protocol errors), use the **alternative** URI Supabase shows (often **IPv4-compatible** vs pooler-specific).
- Prefer the **database password** you set when creating the project (or rotate it under Database settings).

6. Prefer **IPv4** if Supabase warns your network lacks IPv6 (they often offer **“Dedicated IPv4 proxy” / purchase** or connection pooler quirks). Follow their current troubleshooting link in the dashboard if `pg_dump` cannot connect.

---

## Run `pg_dump` (custom format — recommended)

7. Pick a folder for backups, e.g. `Desktop/ppf-db-backups`.

8. Build the connection URI from the dashboard (**never commit it to Git**). Example structure:

   ```bash
   export DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/postgres'
   ```

   Replace `USER`, `PASSWORD`, `HOST`, `PORT` with your project’s values. If the password has special characters (`@`, `#`, etc.), URL-encode them or use a `.pgpass` file (see Postgres docs).

9. Create a dump file (today’s date in the filename). On macOS/Linux:

   ```bash
   mkdir -p ~/Desktop/ppf-db-backups
   pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f ~/Desktop/ppf-db-backups/ppf-$(date +%Y-%m-%d).dump
   ```

   On Windows Command Prompt, replace the path and use a fixed filename or `%date%` patterns you prefer.

   **Flags:**

   - `-Fc` — custom format, good for **`pg_restore`**
   - `--no-owner --no-acl` — restores more smoothly on Supabase/other hosts with different roles

10. Confirm the `.dump` file exists and note its **size** (should be larger than zero).

---

## (Optional) Plain SQL dump

Readable as text; can be larger and slower:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl -f ~/Desktop/ppf-db-backups/ppf-$(date +%Y-%m-%d).sql
```

---

## Restore (dry run on a test project first)

Never practice restore on production until you trust the file.

Using **custom format**:

```bash
pg_restore --clean --if-exists -d "$TARGET_DATABASE_URL" ~/path/to/backup.dump
```

`--clean --if-exists` drops objects before recreating — **destructive on the target DB**. Point `TARGET_DATABASE_URL` at an **empty** test database first.

---

## Keep copies safe

- Store dumps **outside** Supabase only (USB, Google Drive folder you control, etc.).
- Treat `.dump`/`.sql` like **secrets** — they contain everything in the DB.
- **Calendar reminder**: e.g. first Sunday monthly — repeat steps 8–10.

---

## If `pg_dump` fails

| Symptom | What to try |
|--------|--------------|
| Connection refused / timeout | Check Supabase dashboard “paused project”, firewall, VPN, correct host/port |
| Prepared statement / PgBouncer errors | Switch from **transaction pooler** URL to **direct session** / port **5432** if available |
| IPv6 issues | Use Supabase’s **IPv4** connection option or doc for your plan |
| Auth failed | Reset database password in Supabase; rebuild `DATABASE_URL` |

Search Supabase docs for **“pg_dump”** and **“connecting to Postgres”** — product UI strings change over time; the concepts stay the same.
