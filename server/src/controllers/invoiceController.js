const crypto = require('crypto');
const { query, queryOne, execute, withTransaction, now, numericId, isDuplicateError, likeTerm } = require('../utils/db');
const { buildPdf, invoicePdfDefinition } = require('../utils/pdf');
const { cached, invalidate } = require('../utils/cache');
const { sendMail, isMailConfigured } = require('../utils/mailer');
const { buildInvoiceEmail, cleanSubject, cleanBody, MAX_SUBJECT_LENGTH, MAX_BODY_LENGTH } = require('../utils/invoiceEmail');
const { gstOnly, ownerScope } = require('../utils/authz');
const { isGstOnlyInvoice, classifyItems } = require('../utils/gst');
const { localToday, datePrefix } = require('../utils/dates');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Split a recipient string (or array) into a clean, unique list. Accepts
 * commas, semicolons, newlines or spaces as separators, and tolerates
 * display-name paste formats like "Name <a@b.com>".
 */
function parseEmails(raw) {
  if (Array.isArray(raw)) raw = raw.join(',');
  const out = [];
  const seen = new Set();
  const add = (email) => {
    const e = String(email || '').trim();
    if (!e) return;
    const key = e.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  for (const part of String(raw || '').split(/[,;\n]+/)) {
    const token = part.trim();
    if (!token) continue;
    const angled = token.match(/<([^>]+)>/);
    if (angled) { add(angled[1]); continue; }
    const pieces = token.split(/\s+/).filter(Boolean);
    if (pieces.length > 1) {
      const emails = pieces.filter((p) => p.includes('@'));
      if (emails.length) emails.forEach(add);
      else add(token);
    } else {
      add(token);
    }
  }
  return out;
}

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const TOTAL_TTL_MS = 30_000;
const SETTINGS_TTL_MS = 300_000;

/** 'YYYY-MM-DD HH:MM:SS.mmm' (UTC, as stored) -> Date */
function parseDbTime(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T') + (String(value).endsWith('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ============================================================
 * Trash cleanup — Only manual deletion is performed to preserve data integrity
 * ============================================================ */

async function cleanupExpiredTrash() {
  // Automatic deletion disabled: data is never deleted automatically.
}

/* ============================================================
 * Invoice numbers: YYYYMMDD-001, restarting at 001 for each invoice date.
 * The prefix is the invoice's own date (the date picked in the form), so the
 * number always matches the date printed on the invoice.
 * ============================================================ */

/** Next free number for `dateStr` (YYYY-MM-DD, default today in APP_TIMEZONE). */
async function nextInvoiceNumber(dateStr, runner = { query }) {
  const prefix = datePrefix(dateStr);
  const rows = await runner.query('SELECT invoice_no FROM invoices WHERE invoice_no LIKE ?', [`${prefix}-%`]);
  let max = 0;
  for (const row of rows) {
    const seq = Number(String(row.invoice_no).slice(prefix.length + 1));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** True when `invoiceNo` looks like an auto-generated number for `dateStr`. */
function isAutoNumberFor(invoiceNo, dateStr) {
  return new RegExp(`^${datePrefix(dateStr)}-\\d{3,}$`).test(String(invoiceNo || ''));
}

/* ============================================================
 * Cached helpers
 * ============================================================ */

function countWhere(trash, gst, ownerId) {
  return `is_deleted = ${trash ? 1 : 0}${gst ? ' AND is_gst_only = 1' : ''}${ownerId ? ` AND created_by = ${Number(ownerId)}` : ''}`;
}

function countInvoices(trash, gst, ownerId) {
  const key = `invoice:total:${trash ? 'trash' : 'active'}:${gst ? 'gst' : 'all'}:${ownerId ? `u${ownerId}` : 'everyone'}`;
  return cached(key, TOTAL_TTL_MS, async () =>
    Number((await queryOne(`SELECT COUNT(*) AS n FROM invoices WHERE ${countWhere(trash, gst, ownerId)}`))?.n || 0)
  );
}

function getCompanySettings() {
  return cached('invoice:companySettings', SETTINGS_TTL_MS, async () =>
    (await queryOne('SELECT * FROM company_settings ORDER BY id LIMIT 1')) || {}
  );
}

function invalidateCounts() {
  invalidate('invoice:total');
  invalidate('dashboard:');
}

/* ============================================================
 * LRU PDF buffer cache
 * ============================================================ */

const invoicePdfCache = new Map();
const MAX_PDF_CACHE = 500;

function lruGet(key) {
  const val = invoicePdfCache.get(key);
  if (val !== undefined) {
    invoicePdfCache.delete(key);
    invoicePdfCache.set(key, val);
  }
  return val;
}

function lruSet(key, value) {
  if (invoicePdfCache.size >= MAX_PDF_CACHE) {
    const oldest = invoicePdfCache.keys().next().value;
    invoicePdfCache.delete(oldest);
  }
  invoicePdfCache.set(key, value);
}

function getInvoicePdfCacheKey(invoice) {
  const itemsHash = (invoice.items || []).map((it) => `${it.product_id || it.productname || ''}:${it.description || ''}:${it.rate || ''}:${it.quantity || ''}`).join('|');
  return `${invoice.id}:${invoice.version ?? 0}:${invoice.updated_at || invoice.created_at || ''}:${invoice.status || ''}:${invoice.sub_amount || ''}:${itemsHash}`;
}

function computeETag(cacheKey) {
  return `"${crypto.createHash('md5').update(cacheKey).digest('hex').slice(0, 16)}"`;
}

function invalidateInvoicePdfCache(id) {
  if (!id) return;
  const prefix = `${id}:`;
  for (const key of invoicePdfCache.keys()) {
    if (key.startsWith(prefix)) invoicePdfCache.delete(key);
  }
}

/* ============================================================
 * Access scope
 *
 * Two independent restrictions, both decided by the role's permissions:
 *  - Ownership: without `invoices.view_all` a user sees and touches only the
 *    invoices they created (created_by). Admin has view_all by default.
 *  - GST-only: a role holding gst_invoices.* instead of invoices.* is confined
 *    to invoices made up of GST lines only (see utils/gst.js).
 * ============================================================ */

const GST_SCOPE_MESSAGE = 'Your role can only work with GST invoices.';
const GST_REQUIRED_MESSAGE = 'Your role can only bill the GST product. Every line item must be "GST".';
const OWN_SCOPE_MESSAGE = 'You can only work with invoices you created.';
const isGstInvoice = isGstOnlyInvoice;

/** Message when `row` is outside the caller's scope for `action`, else null. */
function scopeDenial(req, action, row) {
  if (!row) return null;
  const owner = ownerScope(req);
  if (owner && Number(row.created_by) !== owner) return OWN_SCOPE_MESSAGE;
  if (gstOnly(req, action) && !isGstInvoice(row)) return GST_SCOPE_MESSAGE;
  return null;
}

/** Same check by id; a missing invoice is not "blocked" so the handler can 404 as usual. */
async function scopeDenialById(req, action, id) {
  const row = await queryOne('SELECT is_gst_only, created_by FROM invoices WHERE id = ?', [id]);
  return scopeDenial(req, action, row);
}

/* ============================================================
 * Shared helpers
 * ============================================================ */

const LIST_COLUMNS = `i.id, i.invoice_no, i.invoice_date, i.customer_id, i.customer_contact, i.sub_amount, i.paid_amount,
  i.due_amount, i.payment_type, i.payment_status, i.status, i.is_gst_bill, i.is_gst_only, i.version, i.created_by, i.created_at,
  i.updated_at, i.is_deleted, i.deleted_at, c.companyname, u.username AS created_by_username`;

const normaliseStatus = (status) => ((status && String(status).toLowerCase() === 'pending') ? 'Unpaid' : (status || 'Unpaid'));

/* ============================================================
 * REST handlers
 * ============================================================ */

// GET /invoices/next-number?date=YYYY-MM-DD (date optional: today in APP_TIMEZONE)
async function nextNumber(req, res) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : localToday();
  res.json({ invoice_no: await nextInvoiceNumber(date), date });
}

const SORT_COLUMNS = {
  invoice_date: 'i.invoice_date',
  invoice_no: 'i.invoice_no',
  sub_amount: 'i.sub_amount',
  due_amount: 'i.due_amount',
  created_at: 'i.created_at',
  deleted_at: 'i.deleted_at',
};

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'invoice_date', dir = 'desc', company, customer_id, trash } = req.query;
  const isTrash = trash === 'true' || trash === true;

  const sortCol = SORT_COLUMNS[sort] || (isTrash ? 'i.deleted_at' : 'i.invoice_date');
  const sortDir = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 1000);

  const conditions = [`i.is_deleted = ${isTrash ? 1 : 0}`];
  const params = [];

  if (customer_id && numericId(customer_id)) {
    conditions.push('i.customer_id = ?');
    params.push(numericId(customer_id));
  }
  const gstScoped = gstOnly(req, 'view');
  if (gstScoped) conditions.push('i.is_gst_only = 1');
  const owner = ownerScope(req);
  if (owner) {
    conditions.push('i.created_by = ?');
    params.push(owner);
  }

  if (company && String(company).trim() && company !== 'All') {
    conditions.push('c.companyname LIKE ?');
    params.push(likeTerm(String(company).trim()));
  }
  const term = String(search || '').trim();
  if (term) {
    conditions.push('(i.invoice_no LIKE ? OR c.companyname LIKE ? OR i.customer_contact LIKE ?)');
    params.push(likeTerm(term), likeTerm(term), likeTerm(term));
  }

  const from = 'FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id LEFT JOIN users u ON u.id = i.created_by';
  const where = conditions.join(' AND ');

  const [rows, count, totalTrashCount, totalActive] = await Promise.all([
    // Same-day invoices follow their number (…-003, …-002, …-001), then id.
    query(`SELECT ${LIST_COLUMNS} ${from} WHERE ${where} ORDER BY ${sortCol} ${sortDir}, i.invoice_no ${sortDir}, i.id ${sortDir} LIMIT ? OFFSET ?`,
      [...params, limitNum, (pageNum - 1) * limitNum]),
    queryOne(`SELECT COUNT(*) AS n ${from} WHERE ${where}`, params),
    countInvoices(true, gstScoped, owner),
    countInvoices(false, gstScoped, owner),
  ]);

  const nowMs = Date.now();
  const data = rows.map((row) => {
    const status = normaliseStatus(row.status);
    const deletedAt = parseDbTime(row.deleted_at);
    if (deletedAt) {
      const elapsedMs = nowMs - deletedAt.getTime();
      const remainingDays = Math.max(0, Math.ceil((TEN_DAYS_MS - elapsedMs) / (1000 * 60 * 60 * 24)));
      return { ...row, status, days_left: remainingDays };
    }
    return { ...row, status };
  });

  res.json({
    data,
    total: Number(count?.n || 0),
    page: pageNum,
    limit: limitNum,
    meta: { activeCount: totalActive, trashCount: totalTrashCount, ownOnly: Boolean(owner) },
  });
}

async function getInvoiceWithItems(id) {
  const invoice = await queryOne('SELECT i.*, u.username AS created_by_username FROM invoices i LEFT JOIN users u ON u.id = i.created_by WHERE i.id = ?', [id]);
  if (!invoice) return null;

  const [customer, items] = await Promise.all([
    invoice.customer_id ? queryOne('SELECT * FROM customers WHERE id = ?', [invoice.customer_id]) : null,
    query(
      `SELECT it.id, it.invoice_id, it.product_id, it.description, it.rate, it.quantity, it.total, COALESCE(p.productname, '') AS productname
         FROM invoice_items it LEFT JOIN products p ON p.id = it.product_id
        WHERE it.invoice_id = ?
        ORDER BY it.id`,
      [id]
    ),
  ]);

  return {
    ...invoice,
    companyname: customer?.companyname || '',
    person_incharge: customer?.person_incharge || '',
    customer_address: customer?.address || '',
    customer_mobile: customer?.mobile_no || '',
    customer_email: customer?.email || '',
    items,
    status: normaliseStatus(invoice.status),
  };
}

async function getOne(req, res) {
  const invoice = await getInvoiceWithItems(numericId(req.params.id));
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  const denial = scopeDenial(req, 'view', invoice);
  if (denial) return res.status(403).json({ message: denial });
  res.json(invoice);
}

const MAX_AMOUNT = 9999999999;
const MAX_ITEMS = 200;
const round2 = (number) => Math.round((number + Number.EPSILON) * 100) / 100;
const lineTotal = (item) => round2(Number(item.rate) * Number(item.quantity));
const computeTotals = (items, paid) => {
  const subAmount = round2(items.reduce((sum, item) => sum + lineTotal(item), 0));
  return { subAmount, dueAmount: round2(Math.max(subAmount - Number(paid || 0), 0)) };
};

function validatePayload(body) {
  const { invoice_no, invoice_date, customer_id, items, paid_amount } = body;
  const missing = [];
  if (!String(invoice_no || '').trim()) missing.push('Invoice number');
  if (!String(invoice_date || '').trim()) missing.push('Invoice date');
  const custId = numericId(customer_id);
  const companyName = String(body.company_name || customer_id || '').trim();
  if (!custId && !companyName) missing.push('Company/Customer');
  if (!Array.isArray(items) || !items.length) missing.push('At least one line item');
  if (missing.length) return `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(invoice_date))) return 'Invoice date must be a valid date (YYYY-MM-DD)';
  if (items.length > MAX_ITEMS) return `An invoice cannot have more than ${MAX_ITEMS} line items`;
  for (let index = 0; index < items.length; index += 1) {
    const rate = Number(items[index].rate);
    const quantity = Number(items[index].quantity);
    if (!items[index].product_id) return `Line ${index + 1}: a product must be selected`;
    if (!Number.isFinite(rate) || rate < 0 || rate > MAX_AMOUNT) return `Line ${index + 1}: rate must be a number between 0 and ${MAX_AMOUNT}`;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_AMOUNT) return `Line ${index + 1}: quantity must be greater than 0`;
  }
  const paid = Number(paid_amount || 0);
  const { subAmount } = computeTotals(items, 0);
  if (!Number.isFinite(paid) || paid < 0) return 'Paid amount cannot be negative';
  if (subAmount > MAX_AMOUNT) return 'Invoice total is too large';
  if (paid > subAmount) return 'Paid amount cannot be more than the invoice total';
  return null;
}

/**
 * Find the customer the request refers to: by id, or by company name, creating
 * the customer when a new name was typed in. Returns null when nothing usable.
 */
async function resolveCustomer(tx, body) {
  const custId = numericId(body.customer_id);
  let customer = custId ? await tx.queryOne('SELECT * FROM customers WHERE id = ?', [custId]) : null;
  if (customer) return customer;

  const name = String(body.company_name || body.customer_id || '').trim();
  if (!name) return null;
  customer = await tx.queryOne('SELECT * FROM customers WHERE companyname = ? LIMIT 1', [name]);
  if (customer) return customer;

  const result = await tx.execute(
    'INSERT INTO customers (companyname, person_incharge, mobile_no, email, address, created_at, updated_at) VALUES (?, NULL, ?, NULL, NULL, ?, ?)',
    [name, body.customer_contact || null, now(), now()]
  );
  return tx.queryOne('SELECT * FROM customers WHERE id = ?', [result.insertId]);
}

/**
 * Insert the line items of an invoice. A line may name its product by id or, when
 * typed in, by text; unknown names become new products.
 */
async function insertItems(tx, invoiceId, items) {
  const nameToId = new Map();
  for (const item of items) {
    if (numericId(item.product_id)) continue;
    const name = String(item.product_id || '').trim();
    if (!name || nameToId.has(name.toLowerCase())) continue;
    let product = await tx.queryOne('SELECT id FROM products WHERE productname = ? LIMIT 1', [name]);
    if (!product) {
      const created = await tx.execute('INSERT INTO products (productname, created_at) VALUES (?, ?)', [name, now()]);
      product = { id: created.insertId };
    }
    nameToId.set(name.toLowerCase(), product.id);
  }

  const rows = items.map((item) => {
    const pId = numericId(item.product_id) || nameToId.get(String(item.product_id || '').trim().toLowerCase()) || 0;
    return [invoiceId, pId, item.description || null, Number(item.rate), Number(item.quantity), lineTotal(item), now(), now()];
  });
  if (rows.length) {
    await tx.execute('INSERT INTO invoice_items (invoice_id, product_id, description, rate, quantity, total, created_at, updated_at) VALUES ?', [rows]);
  }
}

async function create(req, res) {
  const invalid = validatePayload(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  const { invoice_no, invoice_date, customer_contact, items, paid_amount, payment_type, payment_status, status } = req.body;
  const { subAmount, dueAmount } = computeTotals(items, paid_amount);

  // Checked before anything is written so a rejected request from a GST-only
  // account leaves no trace behind.
  const gst = await classifyItems(items);
  if (gstOnly(req, 'create') && !gst.gstOnly) return res.status(400).json({ message: GST_REQUIRED_MESSAGE });

  let invoiceNo = String(invoice_no).trim();
  // Two users can be handed the same daily number at the same moment; when the
  // submitted number is one of today's generated ones, move to the next free one.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const outcome = await withTransaction(async (tx) => {
        const customer = await resolveCustomer(tx, req.body);
        if (!customer) return { error: 'Selected company/customer was not found. Please choose or enter an existing customer.' };

        const result = await tx.execute(
          `INSERT INTO invoices (invoice_no, invoice_date, customer_id, customer_contact, sub_amount, paid_amount, due_amount, payment_type,
             payment_status, status, is_gst_bill, is_gst_only, is_deleted, deleted_at, version, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?)`,
          [invoiceNo, invoice_date, customer.id, customer_contact || null, subAmount, Number(paid_amount || 0), dueAmount,
            payment_type || null, payment_status || null, normaliseStatus(status), gst.gstBill ? 1 : 0, gst.gstOnly ? 1 : 0,
            req.user?.id || null, now(), now()]
        );
        await insertItems(tx, result.insertId, items);
        return { id: result.insertId };
      });
      if (outcome.error) return res.status(400).json({ message: outcome.error });
      invalidateCounts();
      return res.status(201).json({ id: outcome.id, invoice_no: invoiceNo });
    } catch (error) {
      if (!isDuplicateError(error)) throw error;
      if (!isAutoNumberFor(invoiceNo, invoice_date) || attempt === 2) {
        return res.status(409).json({ message: `Invoice number ${invoiceNo} already exists. The next free number for ${invoice_date} is ${await nextInvoiceNumber(invoice_date)}.` });
      }
      invoiceNo = await nextInvoiceNumber(invoice_date);
    }
  }
  return res.status(409).json({ message: 'Could not allocate an invoice number. Please try again.' });
}

async function update(req, res) {
  const invalid = validatePayload(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  const { invoice_no, invoice_date, customer_contact, items, paid_amount, payment_type, payment_status, status, expected_version } = req.body;
  const { subAmount, dueAmount } = computeTotals(items, paid_amount);
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid invoice ID' });

  const existing = await queryOne('SELECT * FROM invoices WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ message: 'Invoice not found' });
  const denial = scopeDenial(req, 'edit', existing);
  if (denial) return res.status(403).json({ message: denial });
  // Checked before customers or products are written; see create().
  const gst = await classifyItems(items);
  if (gstOnly(req, 'edit') && !gst.gstOnly) return res.status(400).json({ message: GST_REQUIRED_MESSAGE });

  const currentVersion = Number(existing.version || 0);
  if (expected_version !== undefined && expected_version !== null && Number(expected_version) !== currentVersion) {
    return res.status(409).json({ message: 'This invoice was changed by someone else while you were editing. Reopen it to see the current version.' });
  }

  const nextStatus = status ? normaliseStatus(status) : normaliseStatus(existing.status);

  try {
    const outcome = await withTransaction(async (tx) => {
      const customer = await resolveCustomer(tx, req.body);
      if (!customer) return { error: 'Customer not found' };

      await tx.execute(
        `UPDATE invoices SET invoice_no = ?, invoice_date = ?, customer_id = ?, customer_contact = ?, sub_amount = ?, paid_amount = ?,
           due_amount = ?, payment_type = ?, payment_status = ?, status = ?, is_gst_bill = ?, is_gst_only = ?, updated_at = ?, version = version + 1
         WHERE id = ?`,
        [String(invoice_no).trim(), invoice_date, customer.id, customer_contact || null, subAmount, Number(paid_amount || 0), dueAmount,
          payment_type || null, payment_status || null, nextStatus, gst.gstBill ? 1 : 0, gst.gstOnly ? 1 : 0, now(), id]
      );
      await tx.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
      await insertItems(tx, id, items);
      return { id };
    });
    if (outcome.error) return res.status(400).json({ message: outcome.error });
    invalidateCounts();
    invalidateInvoicePdfCache(id);
    res.json({ id, invoice_no: String(invoice_no).trim() });
  } catch (error) {
    if (isDuplicateError(error)) return res.status(409).json({ message: 'Invoice number already exists' });
    throw error;
  }
}

async function patchStatus(req, res) {
  if (!req.body.status) return res.status(400).json({ message: 'status is required' });
  const id = numericId(req.params.id);
  const denial = await scopeDenialById(req, 'edit', id);
  if (denial) return res.status(403).json({ message: denial });
  const result = await execute('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?', [normaliseStatus(req.body.status), now(), id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Invoice not found' });
  invalidateCounts();
  invalidateInvoicePdfCache(id);
  res.json({ message: 'Status updated' });
}

// Move to trash (soft delete)
async function remove(req, res) {
  const id = numericId(req.params.id);
  const denial = await scopeDenialById(req, 'delete', id);
  if (denial) return res.status(403).json({ message: denial });
  const result = await execute('UPDATE invoices SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ? AND is_deleted = 0', [now(), now(), id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Invoice not found or already in the trash' });
  invalidateCounts();
  invalidateInvoicePdfCache(id);
  res.json({ message: 'Invoice moved to trash' });
}

// Restore from trash
async function restore(req, res) {
  const id = numericId(req.params.id);
  const denial = await scopeDenialById(req, 'delete', id);
  if (denial) return res.status(403).json({ message: denial });
  const result = await execute('UPDATE invoices SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ? AND is_deleted = 1', [now(), id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Invoice not found in the trash' });
  invalidateCounts();
  invalidateInvoicePdfCache(id);
  res.json({ message: 'Invoice restored successfully' });
}

// Permanent delete from trash
async function permanentDelete(req, res) {
  const id = numericId(req.params.id);
  const denial = await scopeDenialById(req, 'delete', id);
  if (denial) return res.status(403).json({ message: denial });
  const deleted = await withTransaction(async (tx) => {
    const result = await tx.execute('DELETE FROM invoices WHERE id = ?', [id]);
    if (!result.affectedRows) return false;
    await tx.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
    return true;
  });
  if (!deleted) return res.status(404).json({ message: 'Invoice not found' });
  invalidateCounts();
  invalidateInvoicePdfCache(id);
  res.json({ message: 'Invoice permanently deleted' });
}

/* ============================================================
 * Print
 * ============================================================ */

async function buildInvoicePdfBuffer(invoice, settings) {
  const cacheKey = getInvoicePdfCacheKey(invoice);
  const cachedBuffer = lruGet(cacheKey);
  if (cachedBuffer) return cachedBuffer;
  const docDef = invoicePdfDefinition(invoice, invoice.items || [], settings);
  const buffer = await buildPdf(docDef);
  lruSet(cacheKey, buffer);
  return buffer;
}

async function print(req, res) {
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid invoice ID' });

  const [invoice, settings] = await Promise.all([getInvoiceWithItems(id), getCompanySettings()]);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  const denial = scopeDenial(req, 'print', invoice);
  if (denial) return res.status(403).json({ message: denial });

  const cacheKey = getInvoicePdfCacheKey(invoice);
  const etag = computeETag(cacheKey);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoice_no}.pdf"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('ETag', etag);

  const buffer = await buildInvoicePdfBuffer(invoice, settings);
  res.setHeader('Content-Length', buffer.length);
  return res.send(buffer);
}

/* ============================================================
 * Email
 * ============================================================ */

/**
 * What the "email invoice" dialog shows before sending: the recipient on file
 * and the default subject and message generated for this invoice.
 */
async function emailPreview(req, res) {
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid invoice ID' });

  const [invoice, settings] = await Promise.all([getInvoiceWithItems(id), getCompanySettings()]);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  const denial = scopeDenial(req, 'print', invoice);
  if (denial) return res.status(403).json({ message: denial });

  const { defaults, signature } = buildInvoiceEmail(invoice, settings);
  res.json({
    to: invoice.customer_email || '',
    subject: defaults.subject,
    body: defaults.body,
    signature,
    attachment: `Invoice-${invoice.invoice_no || invoice.id}.pdf`,
    mailConfigured: isMailConfigured(),
    limits: { subject: MAX_SUBJECT_LENGTH, body: MAX_BODY_LENGTH },
  });
}

/** Read an optional edited subject / message. Absent means "use the default". */
function readEmailOverrides(body = {}) {
  const overrides = {};
  if (body.subject !== undefined && body.subject !== null) {
    const subject = cleanSubject(body.subject);
    if (!subject) return { error: 'Subject cannot be empty.' };
    if (subject.length > MAX_SUBJECT_LENGTH) return { error: `Subject cannot be longer than ${MAX_SUBJECT_LENGTH} characters.` };
    overrides.subject = subject;
  }
  if (body.body !== undefined && body.body !== null) {
    const message = cleanBody(body.body);
    if (!message) return { error: 'Message cannot be empty.' };
    if (message.length > MAX_BODY_LENGTH) return { error: `Message cannot be longer than ${MAX_BODY_LENGTH} characters.` };
    overrides.body = message;
  }
  return { overrides };
}

async function emailInvoice(req, res) {
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid invoice ID' });
  // Scope first, so an account learns nothing about an out-of-scope invoice.
  const denial = await scopeDenialById(req, 'print', id);
  if (denial) return res.status(403).json({ message: denial });

  const { overrides, error: overrideError } = readEmailOverrides(req.body);
  if (overrideError) return res.status(400).json({ message: overrideError });

  if (!isMailConfigured()) {
    return res.status(400).json({
      message: 'Email sending is not configured on the server. Add SMTP_USER and SMTP_PASS to the server .env.',
    });
  }

  const [invoice, settings] = await Promise.all([getInvoiceWithItems(id), getCompanySettings()]);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

  let toList = parseEmails(req.body?.email ?? req.body?.to);
  if (toList.length === 0) toList = parseEmails(invoice.customer_email);
  const ccList = parseEmails(req.body?.cc);

  if (toList.length === 0) {
    return res.status(400).json({
      message: `No email address on file for ${invoice.companyname || 'this customer'}. Enter a recipient email.`,
    });
  }
  const invalidTo = toList.filter((e) => !EMAIL_RE.test(e));
  if (invalidTo.length) return res.status(400).json({ message: `Invalid recipient email: ${invalidTo.join(', ')}` });
  const invalidCc = ccList.filter((e) => !EMAIL_RE.test(e));
  if (invalidCc.length) return res.status(400).json({ message: `Invalid CC email: ${invalidCc.join(', ')}` });

  const buffer = await buildInvoicePdfBuffer(invoice, settings);
  const { subject, text, html } = buildInvoiceEmail(invoice, settings, overrides);

  try {
    await sendMail({
      to: toList,
      cc: ccList,
      subject,
      text,
      html,
      attachments: [{ filename: `Invoice-${invoice.invoice_no || invoice.id}.pdf`, content: buffer, contentType: 'application/pdf' }],
    });
  } catch (err) {
    const status = err.statusCode || 502;
    return res.status(status).json({ message: err.message || 'Failed to send the email. Please try again.' });
  }

  const summary = toList.join(', ') + (ccList.length ? ` (cc: ${ccList.join(', ')})` : '');
  res.json({ message: `Invoice #${invoice.invoice_no} emailed to ${summary}`, to: toList, cc: ccList, subject });
}

module.exports = {
  nextNumber,
  list,
  getOne,
  create,
  update,
  patchStatus,
  remove,
  restore,
  permanentDelete,
  print,
  emailPreview,
  emailInvoice,
  cleanupExpiredTrash,
};
