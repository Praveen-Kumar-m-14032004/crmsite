# Permit Declaration

A customs / freight-forwarding CRM: customers, products, invoicing and GST billing,
with role-based access and print-ready invoice PDFs.

- **Frontend:** React 18 + Vite, React Router, Axios — `client/`
- **Backend:** Node.js + Express, JWT auth, `mysql2` — `server/`
- **Database:** MySQL / MariaDB (XAMPP), configured with `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
  The API creates the database and all tables on first start.

---

> **Live site:** https://goldenrod-echidna-551891.hostingersite.com (Hostinger, one Node.js
> web app serving the API and the frontend). See [DEPLOYMENT.md](DEPLOYMENT.md) section M
> for the Hostinger setup and every environment variable.

## Quick start

### 1. Start MySQL

Open the XAMPP Control Panel and start **MySQL**. Apache is not needed. Any other
MySQL 5.7+ / MariaDB 10.2+ server works too.

### 2. Configure the API

```bash
cd server
cp .env.example .env
```

The XAMPP defaults (`DB_HOST=127.0.0.1`, `DB_USER=root`, empty `DB_PASSWORD`,
`DB_NAME=permit_declaration`) are already in the example. Set a real `JWT_SECRET`:

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
- API → http://localhost:5001 (set by `PORT` in `server/.env`)

You can also run them separately with `npm run dev` inside `server/` and `client/`.

For a hosted deployment, configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME`, `JWT_SECRET` and `CLIENT_ORIGIN` as application settings. Do not put
credentials in workflow files.

---

## Troubleshooting

**`EADDRINUSE: address already in use :::5000`**
An old server is still running. Find and stop it:

```bash
netstat -ano | findstr :5000
taskkill /PID <pid> /F
```

Or set a different `PORT` in `server/.env`.

**`Cannot reach MySQL`**
Start MySQL in the XAMPP Control Panel and check `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD` and `DB_NAME` in `server/.env`. The API health endpoint is `GET /api/health`.

**Login says "Cannot reach the server"**
The API isn't running. Start it with `npm run dev` from the project root and check the
terminal for `[api] Permit Declaration API listening on http://localhost:5001`.

---

## Roles

| Role | Access |
|---|---|
| **Admin** | Everything — all CRUD plus Users, Roles and Company Settings |
| **Accountant** | Full invoices, view/create customers, view products, reports + export |
| **Sales** | Full customers, view products, read-only invoices |
| **Viewer** | Read-only everywhere, plus report export |
| **Supervisor** | Creates, edits, deletes and prints invoices, but sees only the invoices they created, plus the dashboard |

Invoices are private to the user who created them. A role sees other users' invoices only
when **Invoices → all users' invoices** (`invoices.view_all`) is ticked in the matrix; Admin
has it by default, nobody else does. Dashboard figures and reports follow the same rule.
Invoice numbers are `YYYYMMDD-001`, `-002`, … and restart at 001 each day (Singapore time,
`APP_TIMEZONE`). The matrix also has a **GST invoices only** row for roles that may bill
nothing but the GST product.

### Login accounts

| Role | Username (ID) | Password | Notes |
|---|---|---|---|
| **Admin** | `admin` | `admin` | Default from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `server/.env`. Created automatically on first start. **Change it before going live.** |
| **Supervisor** | `Supervisor` | set by Admin | Existing account (Vicky). The password is the one entered when the user was created; an Admin can set a new one under **User Management → Manage Users → Edit**. |
| **Accountant** | — | — | No account yet. Create one under **User Management → Add User** and pick the Accountant role. |
| **Sales** | — | — | No account yet. Create one the same way with the Sales role. |
| **Viewer** | — | — | No account yet. Create one the same way with the Viewer role. |

Passwords are stored hashed and cannot be read back; if one is lost, an Admin resets it
from **Manage Users → Edit → New password**. Login is at `/login`; usernames are not
case-sensitive. To change the Admin password, either edit it in Manage Users or set
`ADMIN_PASSWORD` in `server/.env` and restart the API (the seed updates it on start).

Permissions are enforced in the API by `requirePermission()` on every route, and mirrored
in the UI (hidden menu items and disabled actions). Admins can create custom roles and
edit the permission matrix under **User Management → Roles & Permissions**.

The matrix has two invoice rows. **Invoices (all)** covers every invoice; **GST invoices
only** covers just the invoices whose every line is the `GST` product (stored as
`is_gst_only`). A role that holds only the GST permissions is confined to those invoices
everywhere: list, trash, counts, view, print, email, edit, delete, restore and the dashboard
figures. Its invoice form offers only the GST product, and saving any other line item is
rejected by the API. Roles are re-read on every request, so a change
saved in the matrix applies to signed-in users within about 30 seconds. Admin always holds
every action permission and cannot be restricted; built-in roles cannot be deleted; a custom
role cannot be deleted while users are assigned to it.

Invoices are private to the user who created them, for every role including Admin: the
list, trash, counts, dashboard and reports only cover a user's own invoices. The
**all users' invoices** switch in the Invoices row is the one permission Admin does not hold
by default; tick it on a role (Admin included) to let that role see and manage everyone's
invoices.

---

## Invoice PDF

`GET /api/invoices/:id/print` renders the invoice server-side with `pdfmake`.

Everything in the letterhead — company name, address, phone, email, website, UEN,
PayNow payee and currency — comes from **Company Settings**, so update that screen
rather than editing code. The printed number is always the stored `invoice_no`.

## Moving data from the old MongoDB

The app used MongoDB before October 2026. To copy everything from that database into
MySQL, set `MONGODB_URI` (and `MONGODB_DB`) in `server/.env`, then run:

```bash
cd server
npm run migrate:mongo              # into an empty MySQL database
npm run migrate:mongo -- --replace # empty the MySQL tables first, then load
```

It copies every table, keeps all numeric ids and relationships, only reads from
MongoDB, and ends with a verification report (row counts, invoice totals, invoice and
quotation numbers, logins). It exits with an error if anything does not match.
For a brand-new database, `npm run seed` (or simply starting the API) creates roles,
permissions, products, company settings and the admin user.

---

## Project layout

```
client/          React app
  src/api/       axios instance + endpoint wrappers
  src/components/  layout (Sidebar, TopBar) and shared UI (DataTable, Modal…)
  src/hooks/     useAuth, usePermissions, useClock, useDataTable, useToast
  src/pages/     one folder per module
server/          Express API
  src/config/    MySQL connection pool and schema (tables are created on start)
  src/middleware/  auth + requirePermission
  src/routes/    one router per resource
  src/controllers/
  src/utils/     db helpers, pdf, excel, csv builders
  scripts/       seed.js, migrate-mongo-to-mysql.js
```
