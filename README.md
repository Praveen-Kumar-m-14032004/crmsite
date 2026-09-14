# Permit Declaration

A customs / freight-forwarding CRM: customers, products, invoicing and GST billing,
with role-based access and print-ready invoice PDFs.

- **Frontend:** React 18 + Vite, React Router, Axios — `client/`
- **Backend:** Node.js + Express, JWT auth, official MongoDB driver — `server/`
- **Database:** MongoDB, configured only with `MONGODB_URI`
- **Legacy source:** `schema.sql` documents former MySQL relationships and seed data; it is not used at runtime.

---

## Quick start

### 1. Start MongoDB

Use a local MongoDB replica set, MongoDB Atlas, or another MongoDB deployment that
supports transactions. Apache is not needed.

### 2. Configure the API

```bash
cd server
cp .env.example .env
```

Set `MONGODB_URI` and, when needed, `MONGODB_DB`. Set a real `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Install and run

From the project root — this starts the API and the web app together:

```bash
npm run install:all
npm run dev
```

- Web app → http://localhost:5173
- API → http://localhost:5000

You can also run them separately with `npm run dev` inside `server/` and `client/`.

For Azure App Service, configure `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, and
`CLIENT_ORIGIN` as application settings. Do not put credentials in workflow files.

---

## Troubleshooting

**`EADDRINUSE: address already in use :::5000`**
An old server is still running. Find and stop it:

```bash
netstat -ano | findstr :5000
taskkill /PID <pid> /F
```

Or set a different `PORT` in `server/.env`.

**`Cannot reach MongoDB`**
Check `MONGODB_URI`, network access, and that the deployment supports replica-set
transactions. The API health endpoint is `GET /api/health`.

**Login says "Cannot reach the server"**
The API isn't running. Start it with `npm run dev` from the project root and check the
terminal for `[api] Permit Declaration API listening on http://localhost:5000`.

---

## Roles

| Role | Access |
|---|---|
| **Admin** | Everything — all CRUD plus Users, Roles and Company Settings |
| **Accountant** | Full invoices, view/create customers, view products, reports + export |
| **Sales** | Full customers, view products, read-only invoices |
| **Viewer** | Read-only everywhere, plus report export |

Permissions are enforced in the API by `requirePermission()` on every route, and mirrored
in the UI (hidden menu items and disabled actions). Admins can create custom roles and
edit the permission matrix under **User Management → Roles & Permissions**.

---

## Invoice PDF

`GET /api/invoices/:id/print` renders the invoice server-side with `pdfmake`.

Everything in the letterhead — company name, address, phone, email, website, UEN,
PayNow payee and currency — comes from **Company Settings**, so update that screen
rather than editing code. The printed number is always the stored `invoice_no`.

## Existing MySQL data

The migration is explicit and idempotent. Configure the legacy `DB_*` variables only
for this command, alongside `MONGODB_URI`, then run:

```bash
cd server
npm run migrate:mysql
```

It copies all legacy tables, preserves numeric IDs and relationships, and advances the
MongoDB counters used for new records. It does not print or store connection secrets.
For a new database, `npm run seed` creates roles, permissions, products, and company
settings. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` only when an admin user is needed.

---

## Project layout

```
client/          React app
  src/api/       axios instance + endpoint wrappers
  src/components/  layout (Sidebar, TopBar) and shared UI (DataTable, Modal…)
  src/hooks/     useAuth, usePermissions, useClock, useDataTable, useToast
  src/pages/     one folder per module
server/          Express API
  src/config/    MongoDB connection and indexes
  src/middleware/  auth + requirePermission
  src/routes/    one router per resource
  src/controllers/
  src/utils/     pdf, excel, csv builders
schema.sql       legacy MySQL relationship and seed reference
```
