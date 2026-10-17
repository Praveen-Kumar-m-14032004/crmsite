# Deploying the CRM for free (demo / testing)

Frontend on **Cloudflare Pages**, API on **Render** (free web service), database on
**Aiven for MySQL** (free plan). Total cost: ₹0. No credit card is needed for any of
the three.

Each step says where it happens: **Dashboard** (hosting website), **Terminal** (your
PC), **Code** (already done in this repository) and **Expect** (what you should see).

Placeholders look like `YOUR-...`. Never paste real passwords, secrets or certificates
into chat, commits or this file.

> **This deployment (created 17 Oct 2026)**
>
> | Part | Value |
> |---|---|
> | Frontend (Cloudflare Pages project `permit-declaration-crm`) | https://permit-declaration-crm.pages.dev |
> | API (Render service name must be `permit-declaration-api`) | https://permit-declaration-api.onrender.com |
> | `VITE_API_URL` baked into the current frontend build | `https://permit-declaration-api.onrender.com/api` |
> | `CLIENT_ORIGIN` to set on Render | `https://permit-declaration-crm.pages.dev,https://*.permit-declaration-crm.pages.dev` |
> | Database | Aiven for **MySQL** free plan, service `crm-mysql` (Singapore, `do-sgp`), database `defaultdb`, app user `crm_app` (an Aiven service user) |
> | Status | API live on Render and verified from the Pages origin on 17 Oct 2026 (health, admin login, CORS allowlist, dashboard, lists) |
>
> Note on Aiven API tokens: they return `<redacted>` for every password, so the
> `avnadmin` password cannot be read by scripts. The app therefore uses the
> `crm_app` service user whose password was set through the API. To narrow its
> rights, run the F.4 `GRANT` statements as `avnadmin` from the Aiven console.
>
> The frontend was published from this PC with `wrangler pages deploy client/dist`
> (login with `npx wrangler login`). To publish again after a change:
> `cd client && VITE_API_URL=https://permit-declaration-api.onrender.com/api npm run build && npx wrangler pages deploy dist --project-name permit-declaration-crm --branch main`

---

## A. Existing project structure and deployment blockers

| Part | Where | What it is |
|---|---|---|
| Frontend | `client/` | React 18 + **JavaScript** (not TypeScript) + Vite 5, React Router 6, Axios. Build: `npm run build` → `client/dist`. |
| Backend | `server/` | Node.js + Express 4, entry point `server/server.js`, start script `npm start` (`node server.js`). CommonJS, no build step. |
| Database | MySQL / MariaDB via `mysql2` pool | `server/src/config/db.js`. Tables are created automatically on first start (`CREATE TABLE IF NOT EXISTS`). Seed data (roles, permissions, products, settings, first admin) is inserted automatically on start by `server/src/utils/seedHelper.js`. |
| Auth | JWT (Bearer token in `Authorization` header, stored in `localStorage`) | Role permissions are re-read from the database on every request (`server/src/middleware/auth.js`). No cookies, no sessions. |
| API prefix | `/api/...` | Routes: `auth`, `dashboard`, `customers`, `products`, `invoices`, `quotations`, `reports`, `roles`, `permissions`, `users`, `company-settings`. Health: `/health` and `/api/health`. |
| File uploads | none | Nothing is written to disk. PDFs and Excel files are generated in memory. Logo and fonts are static assets in the repo. |
| Email | Nodemailer via Gmail SMTP | Optional; only used by "Email invoice". |
| Git | `main` branch on `github.com/Praveen-Kumar-m-14032004/crmsite` | `.gitignore` already excludes `.env`, `node_modules`, `dist`. |

Blockers found and fixed in this repository (see section G for details):

1. The API allowed **any** browser origin. Now only `CLIENT_ORIGIN` is allowed in production.
2. A hard-coded **admin/admin login backdoor** let anyone sign in as Admin regardless of the stored password, and the seeder reset the admin password on every restart. Removed.
3. A hard-coded **MongoDB connection string with a password** sat in the migration script. Removed (the old Atlas credential should also be rotated or the cluster deleted).
4. A **fallback JWT secret** was used when `JWT_SECRET` was missing. Production now refuses to start without one.
5. No TLS support for a hosted MySQL. Added (`DB_SSL`, `DB_SSL_CA_PATH`).
6. The frontend called `/api` on its own host. Now `VITE_API_URL` points it at the Render API.
7. React Router deep links would 404 on Cloudflare Pages. Added `client/public/_redirects`.
8. Render's free instance blocks outbound SMTP ports 25/465/587, so **"Email invoice" will not work on Render's free plan** (see K).
9. The three GitHub Actions workflows in `.github/workflows/` deploy to Azure App Service and currently fail. They are unrelated to this setup; disable or delete them when you no longer use Azure.

---

## B. Hosting services and current free-tier limits (verified 17 Oct 2026)

| Service | Free tier | Key limits | Card needed | Inactivity | Source |
|---|---|---|---|---|---|
| **Render** web service | Free instance | 750 instance-hours per workspace per month; spins down after **15 min** without traffic, wake-up takes about **1 minute**; local files lost on restart; outbound ports 25/465/587 blocked; single instance | No | Spins down, wakes on next request | https://render.com/docs/free |
| **Aiven for MySQL** | Free plan | 1 CPU, **1 GB RAM, 1 GB storage**, single node, daily backups, no time limit | No | Aiven may **power off** (not delete) a free service with no activity; you get a notice and can power it on again | https://aiven.io/docs/platform/concepts/free-plan and https://aiven.io/free-mysql-database |
| **Cloudflare Pages** | Free plan | 500 builds/month, 1 concurrent build, 20-minute build timeout, 20,000 files/site, 25 MiB per file, 100 projects | No | None | https://developers.cloudflare.com/pages/platform/limits/ |

Render's own free Postgres is **not** used (it expires after 30 days and is not MySQL).
Render secret files: https://render.com/docs/configure-environment-variables

---

## C. Architecture

```
Browser
  │  HTTPS
  ▼
Cloudflare Pages  (https://YOUR-PROJECT.pages.dev)
  static React build from client/dist, _redirects → index.html for React Router
  │  HTTPS, Authorization: Bearer <JWT>   (VITE_API_URL = https://YOUR-API.onrender.com/api)
  ▼
Render free web service  (https://YOUR-API.onrender.com)
  Node 20+, Express, rootDir server/, npm ci → npm start, GET /health
  CORS allowlist = CLIENT_ORIGIN, helmet headers, login rate limit, JWT_SECRET
  │  TLS (CA cert from Aiven, verified)
  ▼
Aiven for MySQL free  (mysql-YOUR-SERVICE.aivencloud.com:PORT, database defaultdb)
  tables auto-created on first API start, seed data inserted
```

---

## D. Environment variable reference

### Render (API) — set in the Render dashboard, never in git

| Variable | Example / placeholder | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Enables strict CORS, hides stack traces, requires `JWT_SECRET` |
| `PORT` | (set by Render automatically) | The API listens on `process.env.PORT` |
| `JWT_SECRET` | 64 random hex chars (Render can generate it) | Signs login tokens. **Required.** |
| `JWT_EXPIRES_IN` | `8h` | Token lifetime |
| `CLIENT_ORIGIN` | `https://YOUR-PROJECT.pages.dev,https://*.YOUR-PROJECT.pages.dev` | Browser origins allowed to call the API (comma separated; `*` matches one DNS label, which covers Pages preview URLs) |
| `DB_HOST` | `mysql-YOUR-SERVICE-YOUR-ORG.l.aivencloud.com` | From Aiven "Connection information" |
| `DB_PORT` | `12345` | Aiven uses a non-standard port, not 3306 |
| `DB_USER` | `crm_app` (least privilege) or `avnadmin` | See F.4 |
| `DB_PASSWORD` | (secret) | |
| `DB_NAME` | `defaultdb` | Aiven's pre-created database |
| `DB_SSL` | `true` | Turns on TLS with certificate verification |
| `DB_SSL_CA_PATH` | `/etc/secrets/aiven-ca.pem` | Path of the Render **Secret File** holding Aiven's CA certificate |
| `DB_POOL_SIZE` | `5` | Keep small on the free MySQL plan |
| `ADMIN_USERNAME` | `admin` | Used **only** when the database has no Admin user yet |
| `ADMIN_PASSWORD` | strong password | Same; change it in the app afterwards |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `BANK_ACCOUNT_NAME`, `BANK_ACCOUNT_NO`, `EMAIL_SIGNER_NAME`, `EMAIL_SIGNER_TITLE` | optional | Invoice email; **not functional on Render free** (SMTP ports blocked) |

### Cloudflare Pages (frontend) — Production environment variables

| Variable | Example | Purpose |
|---|---|---|
| `VITE_API_URL` | `https://YOUR-API.onrender.com/api` | Baked into the browser bundle at build time. **Public, no secrets.** |
| `NODE_VERSION` | `20` | Build Node version |

A local copy of each file lives in `server/.env.example` and `client/.env.example`.

---

## E. GitHub setup

The repository already exists with full history, `main` branch and a correct `.gitignore`.
Nothing to initialise. **Do not run `git init`.**

**Terminal** (from the project folder):

```bash
git status                      # review the deployment changes
git add -A
git commit -m "Prepare free-tier deployment (Render + Cloudflare Pages + Aiven MySQL)"
git push origin main
```

**Expect:** the push appears on GitHub. The old Azure workflows may send failure emails; see A.9.

Never commit: `server/.env`, `client/.env*` (except `.env.example`), `*.pem`, `node_modules`, `dist`.
All are in `.gitignore`.

---

## F. MySQL on Aiven: create, secure, import, connect

### F.1 Create the service (Dashboard)

1. Sign up at https://console.aiven.io (GitHub or Google login works; no card).
2. **Create service** → **MySQL** → plan **Free** → cloud/region closest to your users (for Singapore, pick an Asia region if offered on the free plan) → name e.g. `crm-mysql` → **Create service**.
3. Wait until the status is **Running** (a few minutes).

### F.2 Collect connection details (Dashboard)

On the service **Overview** page, "Connection information":

- Host, Port, User (`avnadmin`), Password (click to reveal), Database `defaultdb`, SSL mode `REQUIRED`.
- **Download the CA certificate** (link labelled "CA certificate" / `ca.pem`). Keep it outside the repo, e.g. `server/certs/aiven-ca.pem` (that folder is git-ignored). It contains no private key, but keep it out of git anyway.

### F.3 Create the application database

Use `defaultdb` as the application database. The API creates all tables itself on first start, so no SQL file is required.

### F.4 Least-privilege user (recommended)

**Terminal** (uses XAMPP's MySQL client; replace placeholders):

```bash
"C:/xampp/mysql/bin/mysql.exe" --host=YOUR-AIVEN-HOST --port=YOUR-AIVEN-PORT --user=avnadmin -p --ssl-ca=server/certs/aiven-ca.pem defaultdb
```

Then in the MySQL prompt:

```sql
CREATE USER 'crm_app'@'%' IDENTIFIED BY 'YOUR-STRONG-PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON defaultdb.* TO 'crm_app'@'%';
FLUSH PRIVILEGES;
```

`CREATE`, `ALTER`, `INDEX` and `REFERENCES` are needed once for the automatic table creation; `DROP` is not granted. Use `crm_app` in `DB_USER`.

### F.5 Import existing data (choose one)

**Option 1 – fresh demo database (recommended for a public demo).** Do nothing. On first start the API creates the tables, the five roles, permissions, products, company settings and the Admin account from `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Then add a few synthetic customers and invoices in the app. Real customer names, phone numbers and emails should not be on a public demo.

**Option 2 – copy the local XAMPP data.** **Terminal:**

```bash
# 1. export from XAMPP (schema + data, UTF-8)
"C:/xampp/mysql/bin/mysqldump.exe" -u root --default-character-set=utf8mb4 --single-transaction --routines=0 --triggers=0 permit_declaration > crm-export.sql

# 2. import into Aiven (TLS, into defaultdb)
"C:/xampp/mysql/bin/mysql.exe" --host=YOUR-AIVEN-HOST --port=YOUR-AIVEN-PORT --user=avnadmin -p --ssl-ca=server/certs/aiven-ca.pem defaultdb < crm-export.sql
```

`crm-export.sql` contains customer data: delete it after importing and do not commit it (`*.sql` is not ignored by default, so do not `git add` it). A GUI alternative is HeidiSQL or MySQL Workbench with SSL → CA file set to `aiven-ca.pem`.

**Expect:** `SELECT COUNT(*) FROM invoices;` on Aiven returns the same number as locally.

### F.6 Test the connection from your PC before deploying (Terminal)

```bash
cd server
DB_HOST=YOUR-AIVEN-HOST DB_PORT=YOUR-AIVEN-PORT DB_USER=crm_app DB_PASSWORD='YOUR-STRONG-PASSWORD' DB_NAME=defaultdb DB_SSL=true DB_SSL_CA_PATH=certs/aiven-ca.pem PORT=5099 node server.js
```

**Expect:** `[db] connected to MySQL database defaultdb at ...aivencloud.com:PORT (TLS)` followed by `[seed] ...` and `listening on port 5099`. Stop it with Ctrl+C. (On PowerShell, set the variables with `$env:DB_HOST="..."` first, then `node server.js`.)

### F.7 Persistence check

After the API has started once, restart it (or redeploy on Render) and log in again: users, roles and invoices are still there because they live in Aiven, not on Render's disk.

---

## G. Backend code changes and Render deployment

### G.1 Code changes made (already in this repository)

| File | Change |
|---|---|
| `server/server.js` | `app.set('trust proxy', 1)`; `helmet` security headers; CORS allowlist from `CLIENT_ORIGIN` (comma separated, wildcard support, localhost allowed only outside production); login rate limit (20 attempts / 15 min per IP) and a general API limit; `GET /health`; JSON body limit 1 MB; production refuses to start without `JWT_SECRET`; errors no longer log SQL text or stack traces in production; binds `0.0.0.0:$PORT`; graceful shutdown closes the pool. |
| `server/src/config/db.js` | TLS via `DB_SSL` + `DB_SSL_CA_PATH` / `DB_SSL_CA` with certificate verification on; keep-alive; tolerates a user without `CREATE DATABASE` rights when the database already exists. |
| `server/src/controllers/authController.js` | Removed the admin/admin backdoor. Every account signs in with its stored password; constant-time compare for unknown users. |
| `server/src/utils/seedHelper.js` | The Admin account is created only when no active Admin exists; existing passwords are never reset. |
| `server/scripts/migrate-mongo-to-mysql.js` | Hard-coded MongoDB credential removed; `MONGODB_URI` is required. |
| `server/package.json` | `engines.node >= 20`; dependencies `helmet`, `express-rate-limit`, `mysql2`. Scripts unchanged: `start` = `node server.js`. |
| `render.yaml` | Blueprint: `rootDir: server`, `npm ci`, `npm start`, `/health`, env var placeholders. |

Scripts used on Render:

```json
"start": "node server.js"
```

Build command `npm ci` (clean, reproducible install from `server/package-lock.json`). There is no `npm run build` for the API: it is plain JavaScript.

### G.2 Deploy on Render (Dashboard)

1. Sign up at https://dashboard.render.com with GitHub. Authorise access to the `crmsite` repository.
2. **New → Blueprint** → select `Praveen-Kumar-m-14032004/crmsite` → branch `main`. Render reads `render.yaml`.
   (Manual alternative: **New → Web Service**, repository `crmsite`, branch `main`, **Root Directory** `server`, **Runtime** Node, **Build Command** `npm ci`, **Start Command** `npm start`, **Instance Type** Free, **Health Check Path** `/health`.)
3. Fill in the prompted variables: `CLIENT_ORIGIN` (you can enter a placeholder now and fix it after step H gives you the Pages URL), `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=defaultdb`, `ADMIN_PASSWORD`. `JWT_SECRET` is generated by Render.
4. Open the service → **Environment** → **Secret Files** → **Add Secret File**: filename `aiven-ca.pem`, contents = the full text of the CA certificate you downloaded in F.2. Save. (`DB_SSL_CA_PATH` already points at `/etc/secrets/aiven-ca.pem`.)
5. Click **Deploy** (or wait for the auto deploy). Open **Logs**.

**Expect in the logs:**

```
==> Running 'npm ci'  ... added N packages
==> Running 'npm start'
[db] connected to MySQL database defaultdb at mysql-...aivencloud.com:PORT (TLS)
[seed] default roles, permissions, settings and admin user verified
[api] Permit Declaration API listening on port 10000 (production)
==> Your service is live 🎉
```

6. Note the service URL: `https://YOUR-API.onrender.com`.

### G.3 Test the API (Terminal)

```bash
curl https://YOUR-API.onrender.com/health
# {"status":"ok","database":"mysql"}

curl -X POST https://YOUR-API.onrender.com/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"YOUR-ADMIN-PASSWORD\"}"
# {"token":"...","user":{...,"roleName":"Admin",...}}

curl https://YOUR-API.onrender.com/api/customers -H "Authorization: Bearer PASTE-TOKEN"
# {"data":[...],"total":N,...}
```

The first request after 15 idle minutes takes up to a minute (free instance waking up).

---

## H. Frontend on Cloudflare Pages

### H.1 Code changes made

| File | Change |
|---|---|
| `client/src/api/axios.js` | `baseURL` = `import.meta.env.VITE_API_URL` or `/api` (dev proxy). All API calls, PDF downloads and the email dialog go through this instance, so one variable switches everything. |
| `client/public/_redirects` | `/*  /index.html  200` so `/invoices/12/edit`, `/estimates/5` etc. load on refresh or direct navigation. |
| `client/.env.example` | Documents `VITE_API_URL`. |

`VITE_*` variables are compiled into the JavaScript bundle and are visible to every visitor. Only the public API URL belongs there. Never put database or SMTP settings in the client.

### H.2 Deploy (Dashboard)

1. Sign up at https://dash.cloudflare.com (no card) → **Workers & Pages → Create → Pages → Connect to Git** → authorise GitHub → pick `crmsite`.
2. Settings:
   - **Project name:** e.g. `crm-demo` (gives `https://crm-demo.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** Vite
   - **Root directory:** `client`
   - **Build command:** `npm ci && npm run build`
   - **Build output directory:** `dist`
   - **Environment variables (Production):** `VITE_API_URL` = `https://YOUR-API.onrender.com/api`, `NODE_VERSION` = `20`
3. **Save and Deploy**.

**Expect:** build log ends with `✓ built in …` and `Success: Assets published!`, then a URL `https://crm-demo.pages.dev`.

4. Go back to Render → **Environment** → set `CLIENT_ORIGIN` to `https://crm-demo.pages.dev,https://*.crm-demo.pages.dev` → **Save, rebuild and deploy** (needed so CORS accepts the real frontend origin; the wildcard covers preview deployments).

### H.3 Verify

- Open `https://crm-demo.pages.dev`, press F12 → Network, log in. Requests must go to `https://YOUR-API.onrender.com/api/...`, not `localhost`.
- Refresh on a deep page (e.g. `/invoices`). It must load, not 404.
- Changing `VITE_API_URL` later: edit it in Pages → Settings → Environment variables, then **Deployments → Retry deployment** (or push a commit). Variables are read at build time only.

---

## I. Deployment testing checklist

Run after both sites are live. Items marked **verified locally** were executed by automated suites on 17 Oct 2026 against the same code and a MySQL database (152 API checks: roles, permissions, GST scope, invoices, trash, quotations, customers, products, reports, settings, email preview). Everything in the hosted environment still needs your confirmation.

- [ ] `GET /health` returns `{"status":"ok","database":"mysql"}` (verified locally)
- [ ] Login and logout as Admin; wrong password → "Invalid credentials" (verified locally)
- [ ] 21 wrong logins in a row → 429 "Too many login attempts" (verified locally)
- [ ] Browser from an origin not in `CLIENT_ORIGIN` gets no CORS header; Pages origin and `*.pages.dev` previews do (verified locally)
- [ ] Dashboard loads with counts
- [ ] Customers: create, list, search, edit, delete; delete blocked when invoices exist (verified locally)
- [ ] Products: same (verified locally)
- [ ] Invoices: create, edit, PDF, trash, restore, permanent delete (verified locally)
- [ ] Supervisor role sees GST-only invoices and products (verified locally)
- [ ] Quotations: create, edit, hidden items/sections, PDF (verified locally)
- [ ] Reports preview and PDF / Excel / CSV export (verified locally)
- [ ] Company settings save and persist after a Render redeploy
- [ ] Refresh on `/invoices`, `/estimates/1`, `/roles` works on Cloudflare Pages
- [ ] Responsive layout on a phone (sidebar collapses)
- [ ] HTTPS padlock on both URLs
- [ ] Render logs show no passwords or tokens (verified locally: error log prints code + message only)
- [ ] Email invoice: expected to fail on Render free (ports blocked); shows a clear error

---

## J. Troubleshooting

| Symptom | Likely cause | Where to look | Fix |
|---|---|---|---|
| Browser console: *blocked by CORS policy* | Pages origin not in `CLIENT_ORIGIN`, or trailing slash / http vs https mismatch | Render → Environment | Set `CLIENT_ORIGIN` exactly to `https://crm-demo.pages.dev,https://*.crm-demo.pages.dev`, redeploy |
| 404 on page refresh at `/invoices` | `_redirects` missing from build output | Pages build log, `client/dist/_redirects` | File exists in `client/public`; ensure Root directory is `client` and output `dist` |
| 404 from API | Wrong `VITE_API_URL` (missing `/api`, or pointing at Pages URL) | Network tab → request URL | Set `VITE_API_URL=https://YOUR-API.onrender.com/api` and **retry deployment** |
| 500 from API | Database or code error | Render → Logs (`[error] CODE message`) | Fix the cause; for `ER_*` codes see rows below |
| Render build fails: *npm ci can only install with an existing package-lock.json* | Root directory wrong | Render → Settings → Root Directory | Must be `server` |
| Render build fails on a native module | Node version | Build log | `engines.node >= 20` is set; Render uses Node 20+ |
| Start fails: *JWT_SECRET is not set* | Variable missing | Render → Environment | Add `JWT_SECRET` (Generate value) |
| `ECONNREFUSED` / `ETIMEDOUT` to MySQL | Wrong host/port, or Aiven service powered off | Aiven console service status | Use the Aiven host and **Aiven port** (not 3306); power the service on |
| `ER_ACCESS_DENIED_ERROR` | Wrong user/password or user lacks grants | Aiven → Users; F.4 grants | Re-enter `DB_PASSWORD`; grant `defaultdb.*` |
| `ER_BAD_DB_ERROR` | `DB_NAME` wrong | Render env | `DB_NAME=defaultdb` |
| *self signed certificate in certificate chain* / `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | CA file missing or wrong path | Render → Secret Files | Secret file name `aiven-ca.pem`, `DB_SSL_CA_PATH=/etc/secrets/aiven-ca.pem`. **Do not** set `rejectUnauthorized:false`. |
| `process.env.X` undefined | Saved with "Save only" | Render → Environment | Choose "Save, rebuild and deploy" |
| Frontend still calls `localhost` | Built without `VITE_API_URL` or stale build | Pages → Settings → Environment variables | Add variable for **Production**, retry deployment, hard refresh |
| Login works but next request is 401 | `JWT_SECRET` changed between deploys (old tokens invalid) | — | Log in again; keep `JWT_SECRET` stable |
| First request takes ~1 minute | Render free spin-down | — | Expected; optionally ping `/health` every 10 min with a free uptime monitor |
| Aiven service "Powered off" | No activity for a while | Aiven console | Click **Power on**; data is kept |
| 429 on login | Rate limit | — | Wait 15 minutes |

---

## K. Security, backup and free-tier limitations

Security in this setup:

- HTTPS everywhere (Pages and Render provide certificates). Database connection is TLS with the provider CA verified.
- Secrets only in Render's dashboard; the browser bundle holds only the public API URL.
- Authentication and role permissions are enforced on the API for every route; permissions are re-read live.
- Input validation exists on every write route (required fields, numeric ranges, dates, email formats); SQL uses bound parameters only.
- `helmet` headers, login rate limit, body size limit, no stack traces in production.
- Least-privilege DB user (F.4); database port is reachable only with the password and TLS.
- Fixed in this change: admin backdoor, fallback JWT secret, credential in source.

Still worth doing before showing the demo to others:

- **Rotate or delete the old MongoDB Atlas user** whose password was in git history.
- Use **synthetic data** on the public demo (option F.5 / 1).
- Change the Admin password after first login; create per-role demo users with strong passwords.
- "Email invoice" cannot send from Render free (outbound SMTP blocked). Options: upgrade Render, or switch to an HTTP email API (e.g. Resend / Brevo free tiers) later.

Backups and restore:

- Aiven free includes daily automated backups (restore via the Aiven console).
- Manual backup from your PC: the `mysqldump` command in F.5 against the Aiven host. Restore with the `mysql ... < file.sql` command. Store dumps outside the repo.

Free-tier limits to remember: Render 750 h/month and 15-minute spin-down; Aiven 1 GB storage and power-off on inactivity; Cloudflare 500 builds/month.

---

## L. Final checklist

| # | Task | Status |
|---|---|---|
| 1 | Analyse project, find blockers | Completed |
| 2 | Backend: PORT/0.0.0.0, CORS allowlist, helmet, rate limit, `/health`, TLS DB, graceful shutdown, safe logs | Completed |
| 3 | Remove admin backdoor, fallback JWT secret, hard-coded Mongo credential | Completed |
| 4 | Frontend: `VITE_API_URL`, `_redirects`, env example | Completed |
| 5 | `render.yaml` blueprint, `.env.example` files, `.gitignore` additions | Completed |
| 6 | Build client, run API test suites (152 checks), production-mode CORS and rate-limit checks | Completed |
| 7 | Commit and push to GitHub `main` | Requires user action (or say "push") |
| 8 | Create Aiven MySQL service, download CA, create `crm_app` user | Requires user action (dashboard) |
| 9 | Import data or start fresh | Requires user action |
| 10 | Create Render service from blueprint, set env vars + secret file | Requires user action (dashboard) |
| 11 | Create Cloudflare Pages project, set `VITE_API_URL` | Requires user action (dashboard) |
| 12 | Set final `CLIENT_ORIGIN` on Render and redeploy | Requires user action (dashboard) |
| 13 | Run checklist I on the live URLs | Requires user action |
| 14 | Rotate old MongoDB credential, change Admin password, create demo users | Requires user action |
| 15 | Disable/delete Azure workflows | Not started (optional) |
