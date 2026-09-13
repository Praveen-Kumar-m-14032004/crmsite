const pool = require('../config/db');
const { buildPdf, invoicePdfDefinition } = require('../utils/pdf');
const { invalidate } = require('../utils/cache');

// InnoDB has no stored row count, so SELECT COUNT(*) scans an index - at 50k
// invoices that dominates the cost of every list request, and the unfiltered total
// only changes when an invoice is created or deleted. Cache it and invalidate on
// write; the TTL is just a backstop if the API ever runs as more than one process.
let totalCache = null;
const TOTAL_TTL_MS = 30000;

function invalidateTotal() {
  totalCache = null;
  invalidate("dashboard:");
}

async function totalInvoices() {
  if (totalCache && Date.now() - totalCache.at < TOTAL_TTL_MS) return totalCache.value;
  const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM invoices');
  totalCache = { value: row.total, at: Date.now() };
  return row.total;
}

async function nextNumber(_req, res) {
  const [rows] = await pool.query(
    `SELECT MAX(CAST(invoice_no AS UNSIGNED)) AS maxNo FROM invoices`
  );
  const next = (rows[0].maxNo || 0) + 1;
  res.json({ invoice_no: String(next) });
}

async function list(req, res) {
  const {
    search = '', page = 1, limit = 10, sort = 'invoice_date', dir = 'desc',
  } = req.query;

  const SORTABLE = ['invoice_date', 'invoice_no', 'sub_amount', 'due_amount', 'created_at'];
  const sortCol = SORTABLE.includes(sort) ? sort : 'invoice_date';
  // String() guards against ?dir[]=a, which arrives as an array and would throw.
  const sortDir = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const offset = (pageNum - 1) * limitNum;
  const term = String(search).trim();

  const filter = term
    ? 'WHERE i.invoice_no LIKE ? OR c.companyname LIKE ? OR i.customer_contact LIKE ?'
    : '';
  const params = term ? [`%${term}%`, `%${term}%`, `%${term}%`] : [];

  // Unsearched (the common case): page the invoices on their own first, then join
  // the resulting handful to customers. Joining first lets MySQL drive from
  // customers and filesort every joined row through a temp table just to return 10.
  const sql = term
    ? `SELECT i.*, c.companyname
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       ${filter}
       ORDER BY i.${sortCol} ${sortDir}, i.id ${sortDir}
       LIMIT ? OFFSET ?`
    : `SELECT i.*, c.companyname
       FROM (
         SELECT * FROM invoices
         ORDER BY ${sortCol} ${sortDir}, id ${sortDir}
         LIMIT ? OFFSET ?
       ) i
       JOIN customers c ON c.id = i.customer_id
       ORDER BY i.${sortCol} ${sortDir}, i.id ${sortDir}`;

  // The page and its total are independent - run them together instead of paying
  // for both round trips back to back.
  const [[rows], total] = await Promise.all([
    pool.query(sql, [...params, limitNum, offset]),
    // A filtered count has to be computed live; the unfiltered one is cached.
    term
      ? pool.query(
        `SELECT COUNT(*) AS total FROM invoices i
         JOIN customers c ON c.id = i.customer_id ${filter}`,
        params
      ).then(([r]) => r[0].total)
      : totalInvoices(),
  ]);

  res.json({ data: rows, total, page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const [invRows] = await pool.query(
    `SELECT i.*, c.companyname, c.person_incharge, c.address AS customer_address, c.mobile_no AS customer_mobile
     FROM invoices i JOIN customers c ON c.id = i.customer_id
     WHERE i.id = ?`,
    [req.params.id]
  );
  const invoice = invRows[0];
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

  const [items] = await pool.query(
    `SELECT ii.*, p.productname
     FROM invoice_items ii JOIN products p ON p.id = ii.product_id
     WHERE ii.invoice_id = ?`,
    [req.params.id]
  );

  res.json({ ...invoice, items });
}

// DECIMAL(12,2) headroom - a line total or invoice total above this would be
// silently clamped by MySQL, so reject it at the boundary instead.
const MAX_AMOUNT = 9999999999;
const MAX_ITEMS = 200;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Each stored line total is rounded to 2dp, so the invoice total must be the sum
// of those same rounded values - otherwise the printed lines don't add up to the
// printed total (e.g. three lines of 0.05 x 1.5 show 0.24 but total 0.23).
const lineTotal = (item) => round2(Number(item.rate) * Number(item.quantity));

function computeTotals(items, paidAmount) {
  const subAmount = round2(items.reduce((sum, it) => sum + lineTotal(it), 0));
  const dueAmount = round2(Math.max(subAmount - Number(paidAmount || 0), 0));
  return { subAmount, dueAmount };
}

// The React form validates too, but the API is reachable directly - without this
// a crafted request can store negative invoices or inflate reported revenue.
function validatePayload(body) {
  const { invoice_no, invoice_date, customer_id, items, paid_amount } = body;

  if (!invoice_no || !invoice_date || !customer_id || !Array.isArray(items) || items.length === 0) {
    return 'invoice_no, invoice_date, customer_id and at least one item are required';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(invoice_date))) {
    return 'invoice_date must be a valid date (YYYY-MM-DD)';
  }
  if (items.length > MAX_ITEMS) {
    return `An invoice cannot have more than ${MAX_ITEMS} line items`;
  }

  for (let i = 0; i < items.length; i += 1) {
    const rate = Number(items[i].rate);
    const qty = Number(items[i].quantity);
    if (!items[i].product_id) return `Line ${i + 1}: a product must be selected`;
    if (!Number.isFinite(rate) || rate < 0 || rate > MAX_AMOUNT) {
      return `Line ${i + 1}: rate must be a number between 0 and ${MAX_AMOUNT}`;
    }
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_AMOUNT) {
      return `Line ${i + 1}: quantity must be greater than 0`;
    }
  }

  const paid = Number(paid_amount || 0);
  if (!Number.isFinite(paid) || paid < 0) return 'paid_amount cannot be negative';

  const { subAmount } = computeTotals(items, 0);
  if (subAmount > MAX_AMOUNT) return 'Invoice total is too large';
  if (paid > subAmount) return 'paid_amount cannot be more than the invoice total';

  return null;
}

// One multi-row INSERT rather than a round trip per line - a 20-line invoice held
// a pooled connection and row locks for 20 sequential queries before.
async function insertItems(conn, invoiceId, items) {
  const rows = items.map((it) => [
    invoiceId, it.product_id, it.description || null,
    Number(it.rate), Number(it.quantity), lineTotal(it),
  ]);
  await conn.query(
    `INSERT INTO invoice_items (invoice_id, product_id, description, rate, quantity, total)
     VALUES ?`,
    [rows]
  );
}

async function isGstBill(items) {
  if (!items.length) return false;
  const ids = items.map((it) => it.product_id);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM products WHERE id IN (?) AND productname = 'GST'`,
    [ids]
  );
  return rows[0].cnt > 0;
}

async function create(req, res) {
  const {
    invoice_no, invoice_date, customer_id, customer_contact,
    items, paid_amount, payment_type, payment_status, status,
  } = req.body;

  const invalid = validatePayload(req.body);
  if (invalid) return res.status(400).json({ message: invalid });

  const { subAmount, dueAmount } = computeTotals(items, paid_amount);
  const gstBill = await isGstBill(items);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO invoices
        (invoice_no, invoice_date, customer_id, customer_contact,
         sub_amount, paid_amount, due_amount, payment_type, payment_status, status, is_gst_bill)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_no, invoice_date, customer_id, customer_contact || null,
        subAmount, paid_amount || 0, dueAmount, payment_type || null,
        payment_status || null, status || 'Pending', gstBill ? 1 : 0]
    );

    const invoiceId = result.insertId;
    await insertItems(conn, invoiceId, items);

    await conn.commit();
    invalidateTotal();
    res.status(201).json({ id: invoiceId });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Invoice number already exists' });
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function update(req, res) {
  const {
    invoice_no, invoice_date, customer_id, customer_contact,
    items, paid_amount, payment_type, payment_status, status,
    expected_version,
  } = req.body;

  const invalid = validatePayload(req.body);
  if (invalid) return res.status(400).json({ message: invalid });

  const { subAmount, dueAmount } = computeTotals(items, paid_amount);
  const gstBill = await isGstBill(items);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the row for the rest of the transaction, then check the caller edited the
    // version they were shown. Without this, two people editing the same invoice both
    // save and the second blindly overwrites the first - the losing edit's line items
    // are deleted with no error shown to anyone.
    const [[existing]] = await conn.query(
      'SELECT version FROM invoices WHERE id = ? FOR UPDATE',
      [req.params.id]
    );

    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (expected_version !== undefined && Number(expected_version) !== existing.version) {
      await conn.rollback();
      return res.status(409).json({
        message: 'This invoice was changed by someone else while you were editing. Reopen it to see the current version.',
      });
    }

    // COALESCE keeps the stored workflow status when the caller doesn't send one -
    // editing line items must not silently knock a Paid invoice back to Pending.
    await conn.query(
      `UPDATE invoices SET
        invoice_no = ?, invoice_date = ?, customer_id = ?, customer_contact = ?,
        sub_amount = ?, paid_amount = ?, due_amount = ?, payment_type = ?,
        payment_status = ?, status = COALESCE(?, status), is_gst_bill = ?,
        version = version + 1
       WHERE id = ?`,
      [invoice_no, invoice_date, customer_id, customer_contact || null,
        subAmount, paid_amount || 0, dueAmount, payment_type || null,
        payment_status || null, status || null, gstBill ? 1 : 0, req.params.id]
    );

    await conn.query('DELETE FROM invoice_items WHERE invoice_id = ?', [req.params.id]);
    await insertItems(conn, req.params.id, items);

    await conn.commit();
    invalidateTotal();
    res.json({ id: Number(req.params.id) });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Invoice number already exists' });
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function patchStatus(req, res) {
  const { status } = req.body;
  if (!status) return res.status(400).json({ message: 'status is required' });
  const [result] = await pool.query('UPDATE invoices SET status = ? WHERE id = ?', [status, req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Invoice not found' });
  invalidateTotal();
  res.json({ message: 'Status updated' });
}

async function remove(req, res) {
  const [result] = await pool.query('DELETE FROM invoices WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Invoice not found' });
  invalidateTotal();
  res.json({ message: 'Invoice deleted' });
}

async function print(req, res) {
  const [invRows] = await pool.query(
    `SELECT i.*, c.companyname, c.person_incharge, c.address AS customer_address, c.mobile_no AS customer_mobile
     FROM invoices i JOIN customers c ON c.id = i.customer_id
     WHERE i.id = ?`,
    [req.params.id]
  );
  const invoice = invRows[0];
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

  const [items] = await pool.query(
    `SELECT ii.*, p.productname
     FROM invoice_items ii JOIN products p ON p.id = ii.product_id
     WHERE ii.invoice_id = ?`,
    [req.params.id]
  );

  const [settingsRows] = await pool.query('SELECT * FROM company_settings LIMIT 1');
  const settings = settingsRows[0] || {};

  const pdfBuffer = await buildPdf(invoicePdfDefinition(invoice, items, settings));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoice_no}.pdf"`);
  res.send(pdfBuffer);
}

module.exports = { nextNumber, list, getOne, create, update, patchStatus, remove, print };
