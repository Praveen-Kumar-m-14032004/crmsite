# Permit Declaration

A customs / freight-forwarding CRM: customers, products, invoicing and GST billing,
with role-based access and print-ready invoice PDFs.

- **Frontend:** React 18 + Vite, React Router, Axios — `client/`
- **Backend:** Node.js + Express, JWT auth, mysql2 — `server/`
- **Database:** MySQL / MariaDB via XAMPP — `schema.sql`

---

## Quick start

### 1. Start MySQL

Open the **XAMPP Control Panel** and start **MySQL**. Apache is not needed — the API
runs on its own Node server.

### 2. Import the database

In phpMyAdmin (`http://localhost/phpmyadmin`) → **Import** → choose `schema.sql` → **Go**.

Or from a terminal:

```bash
mysql -u root -p < schema.sql
```

This creates the `permit_declaration` database with all tables, the four seeded roles
and their permissions, an admin account, sample customers and products, and invoice
#290 which reproduces the reference invoice PDF.

**Login:** `admin` / `admin`

### 3. Configure the API

```bash
cd server
cp .env.example .env
```

The defaults match a stock XAMPP install (`root`, no password). Set a real `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Install and run

From the project root — this starts the API and the web app together:

```bash
npm run install:all
npm run dev
```

- Web app → http://localhost:5173
- API → http://localhost:5000

You can also run them separately with `npm run dev` inside `server/` and `client/`.

---

## Troubleshooting

**`EADDRINUSE: address already in use :::5000`**
An old server is still running. Find and stop it:

```bash
netstat -ano | findstr :5000
taskkill /PID <pid> /F
```

Or set a different `PORT` in `server/.env`.

**`Cannot reach the database. Is MySQL running in XAMPP?`**
Start MySQL in the XAMPP Control Panel, confirm you imported `schema.sql`, and check
`DB_USER` / `DB_PASSWORD` / `DB_NAME` in `server/.env`.

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

---

## Project layout

```
client/          React app
  src/api/       axios instance + endpoint wrappers
  src/components/  layout (Sidebar, TopBar) and shared UI (DataTable, Modal…)
  src/hooks/     useAuth, usePermissions, useClock, useDataTable, useToast
  src/pages/     one folder per module
server/          Express API
  src/config/    mysql2 pool
  src/middleware/  auth + requirePermission
  src/routes/    one router per resource
  src/controllers/
  src/utils/     pdf, excel, csv builders
schema.sql       database + seed data
```
