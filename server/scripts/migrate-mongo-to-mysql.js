/**
 * One-time migration: copy every record from the old MongoDB database into the
 * MySQL / MariaDB database the API now uses (XAMPP by default).
 *
 *   cd server
 *   npm run migrate:mongo
 *
 * - Reads MongoDB from MONGODB_URI / MONGODB_DB (server/.env). MongoDB is only read,
 *   never changed, so the script can be re-run safely; existing MySQL rows with the
 *   same id are updated, nothing is duplicated.
 * - Writes to the MySQL database from DB_HOST / DB_USER / DB_PASSWORD / DB_NAME,
 *   creating the database and tables when needed.
 * - Keeps every numeric id, so invoices, items, customers, users and roles stay
 *   linked exactly as before.
 * - Ends with a verification report (row counts, invoice totals, numbers, logins)
 *   and exits with code 1 if anything does not match.
 */
require('dotenv').config();

const { MongoClient } = require('mongodb');
const { connect, getPool, close, databaseName } = require('../src/config/db');

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || 'permit_declaration';
if (!mongoUri) {
  console.error('[migrate] Set MONGODB_URI in server/.env (the old MongoDB connection string) before running this script.');
  process.exit(1);
}

/* ---------- value converters ---------- */
const dt = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 23).replace('T', ' ');
};
const day = (value) => {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};
const bit = (value) => (value === true || value === 1 || value === '1' ? 1 : 0);
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const str = (value) => (value === undefined || value === null ? null : String(value));
const json = (value) => (value === undefined || value === null ? null : JSON.stringify(value));
const intOrNull = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/* ---------- table definitions: Mongo collection -> MySQL table ---------- */
const TABLES = [
  {
    table: 'roles', collection: 'roles',
    columns: ['id', 'name', 'description', 'is_system', 'created_at', 'updated_at'],
    map: (d) => [d.id, d.name, str(d.description), bit(d.is_system), dt(d.created_at), dt(d.updated_at)],
  },
  {
    table: 'permissions', collection: 'permissions',
    columns: ['id', 'code', 'module', 'action'],
    map: (d) => [d.id, d.code, d.module, d.action],
  },
  {
    table: 'users', collection: 'users',
    columns: ['id', 'name', 'username', 'email', 'password', 'role_id', 'is_active', 'created_at', 'updated_at'],
    map: (d) => [d.id, str(d.name), d.username, str(d.email), d.password, intOrNull(d.role_id), bit(d.is_active), dt(d.created_at), dt(d.updated_at)],
  },
  {
    table: 'customers', collection: 'customers',
    columns: ['id', 'companyname', 'person_incharge', 'mobile_no', 'email', 'address', 'created_at', 'updated_at'],
    map: (d) => [d.id, String(d.companyname || ''), str(d.person_incharge), str(d.mobile_no), str(d.email), str(d.address), dt(d.created_at), dt(d.updated_at)],
  },
  {
    table: 'products', collection: 'products',
    columns: ['id', 'productname', 'created_at', 'updated_at'],
    map: (d) => [d.id, String(d.productname || ''), dt(d.created_at), dt(d.updated_at)],
  },
  {
    table: 'invoices', collection: 'invoices',
    columns: ['id', 'invoice_no', 'invoice_date', 'customer_id', 'customer_contact', 'sub_amount', 'paid_amount', 'due_amount', 'payment_type',
      'payment_status', 'status', 'is_gst_bill', 'is_gst_only', 'is_deleted', 'deleted_at', 'version', 'created_at', 'updated_at'],
    map: (d) => [d.id, String(d.invoice_no), day(d.invoice_date), intOrNull(d.customer_id), str(d.customer_contact), num(d.sub_amount), num(d.paid_amount),
      num(d.due_amount), str(d.payment_type), str(d.payment_status), d.status || 'Unpaid', bit(d.is_gst_bill),
      d.is_gst_only === undefined || d.is_gst_only === null ? null : bit(d.is_gst_only), bit(d.is_deleted), dt(d.deleted_at), num(d.version), dt(d.created_at), dt(d.updated_at)],
  },
  {
    table: 'invoice_items', collection: 'invoice_items',
    columns: ['id', 'invoice_id', 'product_id', 'description', 'rate', 'quantity', 'total', 'created_at', 'updated_at'],
    map: (d) => [d.id, num(d.invoice_id), num(d.product_id), str(d.description), num(d.rate), num(d.quantity, 1), num(d.total), dt(d.created_at), dt(d.updated_at)],
  },
  {
    table: 'quotations', collection: 'quotations',
    columns: ['id', 'quotation_no', 'customer_id', 'companyname', 'address', 'person_incharge', 'mobile_no', 'customer_contact', 'quotation_date', 'items',
      'sub_amount', 'notes', 'doc_title', 'item_cost', 'turnaround', 'procedures', 'operating_hours', 'terms', 'closing_note', 'visibility', 'created_at', 'updated_at'],
    map: (d) => [d.id, String(d.quotation_no), intOrNull(d.customer_id), String(d.companyname || ''), str(d.address), str(d.person_incharge), str(d.mobile_no),
      str(d.customer_contact), day(d.quotation_date), json(Array.isArray(d.items) ? d.items : []), num(d.sub_amount), str(d.notes), str(d.doc_title),
      str(d.item_cost), json(d.turnaround), str(d.procedures), str(d.operating_hours), json(d.terms), str(d.closing_note), json(d.visibility),
      dt(d.created_at), dt(d.updated_at)],
  },
  {
    table: 'company_settings', collection: 'company_settings',
    columns: ['id', 'company_name', 'address', 'tel', 'mobile', 'email', 'website', 'contact_no', 'uen', 'default_currency', 'created_at', 'updated_at'],
    map: (d) => [d.id || 1, String(d.company_name || ''), str(d.address), str(d.tel), str(d.mobile), str(d.email), str(d.website), str(d.contact_no), str(d.uen),
      d.default_currency || 'SGD', dt(d.created_at), dt(d.updated_at)],
  },
];

async function upsertRows(pool, table, columns, rows) {
  if (!rows.length) return;
  const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = VALUES(${c})`).join(', ');
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    await pool.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ? ON DUPLICATE KEY UPDATE ${updates}`, [rows.slice(i, i + chunk)]);
  }
}

// Emptied before loading, children first, so MongoDB ids can be kept as they are.
const CLEAR_ORDER = ['role_permissions', 'invoice_items', 'invoices', 'quotations', 'users', 'customers', 'products', 'permissions', 'roles', 'company_settings'];

async function main() {
  const replace = process.argv.includes('--replace');

  console.log(`[migrate] MySQL target: database "${process.env.DB_NAME || 'permit_declaration'}" on ${process.env.DB_HOST || '127.0.0.1'}`);
  await connect();
  const pool = getPool();

  // Refuse to mix: the target must be empty (apart from what the API seeds on
  // start) unless --replace is given, in which case it is emptied first.
  let existingRows = 0;
  for (const table of CLEAR_ORDER) {
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);
    existingRows += Number(n);
  }
  if (existingRows && !replace) {
    console.error(`[migrate] The MySQL database already holds ${existingRows} rows. Run again with --replace to empty it and load the MongoDB data:`);
    console.error('          npm run migrate:mongo -- --replace');
    await close();
    process.exitCode = 1;
    return;
  }
  if (existingRows) {
    console.log(`[migrate] --replace: emptying ${existingRows} existing MySQL rows first`);
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of CLEAR_ORDER) await pool.query(`TRUNCATE TABLE ${table}`);
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  console.log(`[migrate] MongoDB source: database "${mongoDbName}" (read only)`);
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000 });
  await client.connect();
  const mongo = client.db(mongoDbName);
  console.log('[migrate] connected to both databases\n');

  const report = [];
  const problems = [];

  for (const def of TABLES) {
    process.stdout.write(`[migrate] ${def.collection} -> ${def.table} ... `);
    const docs = await mongo.collection(def.collection).find().toArray();
    const usable = docs.filter((d) => Number.isInteger(Number(d.id)) && Number(d.id) > 0 || def.table === 'company_settings');
    const skipped = docs.length - usable.length;
    if (skipped) problems.push(`${def.collection}: ${skipped} document(s) without a numeric id were skipped`);

    const rows = usable.map(def.map);
    await upsertRows(pool, def.table, def.columns, rows);

    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${def.table}`);
    const ok = Number(n) >= usable.length;
    if (!ok) problems.push(`${def.table}: MySQL has ${n} rows but MongoDB had ${usable.length}`);
    report.push({ table: def.table, mongo: docs.length, mysql: Number(n), status: ok ? 'ok' : 'MISMATCH' });
    console.log(`${docs.length} copied`);
  }

  // role_permissions last: both sides must exist (foreign keys).
  const links = await mongo.collection('role_permissions').find().toArray();
  const [roleRows] = await pool.query('SELECT id FROM roles');
  const [permRows] = await pool.query('SELECT id FROM permissions');
  const roleIds = new Set(roleRows.map((r) => r.id));
  const permIds = new Set(permRows.map((r) => r.id));
  const pairs = [...new Set(links.map((l) => `${l.role_id}:${l.permission_id}`))].map((key) => key.split(':').map(Number));
  const valid = pairs.filter(([r, p]) => roleIds.has(r) && permIds.has(p));
  if (valid.length !== pairs.length) problems.push(`role_permissions: ${pairs.length - valid.length} link(s) point at a missing role or permission and were skipped`);
  if (valid.length) await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ?', [valid]);
  const [[{ n: rpCount }]] = await pool.query('SELECT COUNT(*) AS n FROM role_permissions');
  report.push({ table: 'role_permissions', mongo: links.length, mysql: Number(rpCount), status: Number(rpCount) >= valid.length ? 'ok' : 'MISMATCH' });

  /* ---------- verification beyond counts ---------- */
  const mongoInvoices = await mongo.collection('invoices').find().toArray();
  const [[sums]] = await pool.query('SELECT COALESCE(SUM(sub_amount),0) AS total, COALESCE(SUM(paid_amount),0) AS paid FROM invoices');
  const mongoTotal = mongoInvoices.reduce((s, i) => s + num(i.sub_amount), 0);
  const mongoPaid = mongoInvoices.reduce((s, i) => s + num(i.paid_amount), 0);
  const money = (v) => Number(v).toFixed(2);
  if (money(sums.total) !== money(mongoTotal) || money(sums.paid) !== money(mongoPaid)) {
    problems.push(`invoice totals differ: MySQL ${money(sums.total)}/${money(sums.paid)} vs MongoDB ${money(mongoTotal)}/${money(mongoPaid)}`);
  }

  const sameSet = async (label, collection, field, table) => {
    const source = new Set((await mongo.collection(collection).find({}, { projection: { [field]: 1 } }).toArray()).map((d) => String(d[field])));
    const [rows] = await pool.query(`SELECT ${field} AS v FROM ${table}`);
    const target = new Set(rows.map((r) => String(r.v)));
    const missing = [...source].filter((v) => !target.has(v));
    if (missing.length) problems.push(`${label}: missing in MySQL: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
  };
  await sameSet('invoice numbers', 'invoices', 'invoice_no', 'invoices');
  await sameSet('quotation numbers', 'quotations', 'quotation_no', 'quotations');
  await sameSet('usernames', 'users', 'username', 'users');
  await sameSet('permission codes', 'permissions', 'code', 'permissions');
  await sameSet('product names', 'products', 'productname', 'products');
  await sameSet('customer names', 'customers', 'companyname', 'customers');

  // Every invoice line must still point at its invoice.
  const [[orphans]] = await pool.query('SELECT COUNT(*) AS n FROM invoice_items it LEFT JOIN invoices i ON i.id = it.invoice_id WHERE i.id IS NULL');
  if (Number(orphans.n)) problems.push(`${orphans.n} invoice line(s) have no invoice`);

  console.log('table              mongo   mysql   status');
  for (const row of report) {
    console.log(`${row.table.padEnd(18)} ${String(row.mongo).padStart(5)}   ${String(row.mysql).padStart(5)}   ${row.status}`);
  }
  console.log(`\ninvoice totals: sub_amount ${money(sums.total)}, paid ${money(sums.paid)} (MongoDB: ${money(mongoTotal)}, ${money(mongoPaid)})`);

  await client.close();
  await close();

  if (problems.length) {
    console.error('\n[migrate] PROBLEMS:');
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exitCode = 1;
  } else {
    console.log('\n[migrate] All data copied and verified. MongoDB was not modified.');
  }
}

main().catch(async (err) => {
  console.error('[migrate] failed:', err.message);
  try { await close(); } catch { /* ignore */ }
  process.exitCode = 1;
});
