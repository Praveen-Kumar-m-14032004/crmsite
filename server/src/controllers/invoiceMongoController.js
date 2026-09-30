const crypto = require('crypto');
const { collection, nextId, nextIds, now, numericId, isDuplicateError } = require('../utils/mongo');
const { buildPdf, createPdfStream, invoicePdfDefinition } = require('../utils/pdf');
const { cached, invalidate } = require('../utils/cache');
const { sendMail, isMailConfigured } = require('../utils/mailer');
const { buildInvoiceEmail } = require('../utils/invoiceEmail');
const { gstOnly } = require('../utils/authz');

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
  // Split on comma / semicolon / newline only — keep spaces so "Name <email>" survives.
  for (const part of String(raw || '').split(/[,;\n]+/)) {
    const token = part.trim();
    if (!token) continue;
    const angled = token.match(/<([^>]+)>/); // "Name <email>" -> email
    if (angled) { add(angled[1]); continue; }
    const pieces = token.split(/\s+/).filter(Boolean);
    if (pieces.length > 1) {
      // Space-separated: keep the pieces that look like emails; otherwise keep
      // the whole token so validation can report it.
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
const TRASH_COUNT_TTL_MS = 30_000;
const SETTINGS_TTL_MS = 300_000;

/* ============================================================
 * Trash cleanup — Only manual deletion is performed to preserve data integrity
 * ============================================================ */

async function cleanupExpiredTrash() {
  // Automatic deletion disabled: data is never deleted automatically.
  // Invoices in trash are only permanently removed when explicitly requested by the user.
}

/* ============================================================
 * Cached helpers
 * ============================================================ */

function totalInvoices() {
  return cached('invoice:totalActive', TOTAL_TTL_MS, () =>
    collection('invoices').countDocuments({ is_deleted: { $ne: true } })
  );
}

function totalTrash() {
  return cached('invoice:totalTrash', TRASH_COUNT_TTL_MS, () =>
    collection('invoices').countDocuments({ is_deleted: true })
  );
}

function totalGstInvoices() {
  return cached('invoice:totalActiveGst', TOTAL_TTL_MS, () =>
    collection('invoices').countDocuments({ is_deleted: { $ne: true }, ...GST_FILTER })
  );
}

function totalGstTrash() {
  return cached('invoice:totalTrashGst', TRASH_COUNT_TTL_MS, () =>
    collection('invoices').countDocuments({ is_deleted: true, ...GST_FILTER })
  );
}

function getCompanySettings() {
  return cached('invoice:companySettings', SETTINGS_TTL_MS, async () =>
    (await collection('company_settings').findOne({})) || {}
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
    // LRU touch: move to end
    invoicePdfCache.delete(key);
    invoicePdfCache.set(key, val);
  }
  return val;
}

function lruSet(key, value) {
  if (invoicePdfCache.size >= MAX_PDF_CACHE) {
    // Evict oldest (first key in Map iteration order)
    const oldest = invoicePdfCache.keys().next().value;
    invoicePdfCache.delete(oldest);
  }
  invoicePdfCache.set(key, value);
}

function getInvoicePdfCacheKey(invoice) {
  const itemsHash = (invoice.items || []).map((it) => `${it.product_id || it.productname || ''}:${it.description || ''}:${it.rate || ''}:${it.quantity || ''}`).join('|');
  return `${invoice.id}:${invoice.version ?? 0}:${invoice.updated_at || invoice.created_at || ''}:${invoice.status || ''}:${invoice.sub_amount || ''}:${itemsHash}`;
}

/**
 * Compute a short ETag hash from the cache key.
 * This lets the browser skip re-downloading an unchanged PDF.
 */
function computeETag(cacheKey) {
  return `"${crypto.createHash('md5').update(cacheKey).digest('hex').slice(0, 16)}"`;
}

function invalidateInvoicePdfCache(id) {
  if (!id) return;
  const prefix = `${id}:`;
  for (const key of invoicePdfCache.keys()) {
    if (key.startsWith(prefix)) {
      invoicePdfCache.delete(key);
    }
  }
}

/* ============================================================
 * GST scope
 *
 * A role may hold only the gst_invoices.* permissions (the Supervisor role).
 * Such callers see and touch nothing but invoices flagged is_gst_bill, and every
 * invoice they create or edit must keep the GST line item.
 * ============================================================ */

const GST_FILTER = { is_gst_bill: { $in: [1, true, '1'] } };
const GST_SCOPE_MESSAGE = 'Your role can only work with GST invoices.';
const GST_REQUIRED_MESSAGE = 'Your role can only save GST invoices. Add the "GST" product as a line item.';

function isGstInvoice(doc) {
  return doc?.is_gst_bill === 1 || doc?.is_gst_bill === true || doc?.is_gst_bill === '1';
}

/**
 * True when the caller is GST-scoped for `action` and the invoice `id` is not a
 * GST bill. A missing invoice is not "blocked" so the handler can 404 as usual.
 */
async function blockedByGstScope(req, action, id) {
  if (!gstOnly(req, action)) return false;
  const doc = await collection('invoices').findOne({ id }, { projection: { is_gst_bill: 1 } });
  return doc ? !isGstInvoice(doc) : false;
}

/* ============================================================
 * Shared helpers
 * ============================================================ */

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const customerLookup = () => [
  { $lookup: { from: 'customers', localField: 'customer_id', foreignField: 'id', as: 'customer' } },
  { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
];

const projection = () => ({
  id: 1,
  invoice_no: 1,
  invoice_date: 1,
  customer_id: 1,
  customer_contact: 1,
  sub_amount: 1,
  paid_amount: 1,
  due_amount: 1,
  payment_type: 1,
  payment_status: 1,
  status: 1,
  is_gst_bill: 1,
  version: 1,
  created_at: 1,
  updated_at: 1,
  is_deleted: 1,
  deleted_at: 1,
  companyname: '$customer.companyname',
});

/* ============================================================
 * REST handlers
 * ============================================================ */

async function nextNumber(_req, res) {
  const invoices = await collection('invoices')
    .find({}, { projection: { invoice_no: 1 } })
    .sort({ id: -1 })
    .limit(100)
    .toArray();
  let maxSeq = 100; // first invoice will be 101
  for (const inv of invoices) {
    const parts = String(inv.invoice_no).split('-');
    const seq = Number(parts[parts.length - 1]) || Number(inv.invoice_no) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  const d = new Date();
  const prefix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  res.json({ invoice_no: `${prefix}-${maxSeq + 1}` });
}

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'invoice_date', dir = 'desc', company, customer_id, trash } = req.query;
  const isTrash = trash === 'true' || trash === true;

  // NOTE: trash cleanup removed from here — it runs on an hourly setInterval instead.
  // Running it on every page load was adding 50–200ms per request.

  const sortable = ['invoice_date', 'invoice_no', 'sub_amount', 'due_amount', 'created_at', 'deleted_at'];
  const sortCol = sortable.includes(sort) ? sort : (isTrash ? 'deleted_at' : 'invoice_date');
  const sortDir = String(dir).toLowerCase() === 'asc' ? 1 : -1;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 1000);

  const matchConditions = [];
  if (isTrash) {
    matchConditions.push({ is_deleted: true });
  } else {
    matchConditions.push({ is_deleted: { $ne: true } });
  }

  if (customer_id && numericId(customer_id)) {
    matchConditions.push({ customer_id: numericId(customer_id) });
  }

  const gstScoped = gstOnly(req, 'view');
  if (gstScoped) matchConditions.push(GST_FILTER);

  const pipeline = [{ $match: { $and: matchConditions } }, ...customerLookup()];
  const postMatch = [];

  if (company && String(company).trim() && company !== 'All') {
    postMatch.push({ 'customer.companyname': { $regex: escapeRegex(String(company).trim()), $options: 'i' } });
  }
  if (String(search).trim()) {
    const regex = { $regex: escapeRegex(String(search).trim()), $options: 'i' };
    postMatch.push({ $or: [{ invoice_no: regex }, { 'customer.companyname': regex }, { customer_contact: regex }] });
  }

  if (postMatch.length) {
    pipeline.push({ $match: { $and: postMatch } });
  }

  const [result] = await collection('invoices').aggregate([
    ...pipeline,
    {
      $facet: {
        data: [{ $sort: { [sortCol]: sortDir, id: sortDir } }, { $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }, { $project: projection() }],
        count: [{ $count: 'total' }],
      },
    },
  ]).toArray();

  const filteredTotal = result.count[0]?.total || 0;

  // Both counts are cached — no extra DB roundtrips on normal page loads
  const [totalTrashCount, totalActive] = gstScoped
    ? await Promise.all([totalGstTrash(), totalGstInvoices()])
    : await Promise.all([totalTrash(), totalInvoices()]);

  const nowMs = Date.now();
  const data = (result.data || []).map((row) => {
    const status = (row.status && String(row.status).toLowerCase() === 'pending') ? 'Unpaid' : (row.status || 'Unpaid');
    if (row.deleted_at) {
      const elapsedMs = nowMs - new Date(row.deleted_at).getTime();
      const remainingDays = Math.max(0, Math.ceil((TEN_DAYS_MS - elapsedMs) / (1000 * 60 * 60 * 24)));
      return { ...row, status, days_left: remainingDays };
    }
    return { ...row, status };
  });

  res.json({
    data,
    total: filteredTotal,
    page: pageNum,
    limit: limitNum,
    meta: {
      activeCount: totalActive,
      trashCount: totalTrashCount,
    },
  });
}

async function getInvoiceWithItems(id) {
  const invoice = await collection('invoices').findOne({ id });
  if (!invoice) return null;

  const [customer, items] = await Promise.all([
    invoice.customer_id ? collection('customers').findOne({ id: invoice.customer_id }) : null,
    collection('invoice_items').find({ invoice_id: id }).sort({ id: 1 }).toArray(),
  ]);

  const pIds = [...new Set(items.map((it) => it.product_id).filter(Boolean))];
  const products = pIds.length > 0 ? await collection('products').find({ id: { $in: pIds } }).toArray() : [];
  const prodMap = new Map(products.map((p) => [p.id, p.productname]));

  const enrichedItems = items.map((it) => ({
    id: it.id,
    invoice_id: it.invoice_id,
    product_id: it.product_id,
    description: it.description,
    rate: it.rate,
    quantity: it.quantity,
    total: it.total,
    productname: prodMap.get(it.product_id) || '',
  }));

  const normStatus = (invoice.status && String(invoice.status).toLowerCase() === 'pending') ? 'Unpaid' : (invoice.status || 'Unpaid');
  return {
    ...invoice,
    companyname: customer?.companyname || '',
    person_incharge: customer?.person_incharge || '',
    customer_address: customer?.address || '',
    customer_mobile: customer?.mobile_no || '',
    customer_email: customer?.email || '',
    items: enrichedItems,
    status: normStatus,
  };
}

async function getOne(req, res) {
  const invoice = await getInvoiceWithItems(numericId(req.params.id));
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  if (gstOnly(req, 'view') && !isGstInvoice(invoice)) return res.status(403).json({ message: GST_SCOPE_MESSAGE });
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

const isGstName = (name) => String(name || '').trim().toUpperCase() === 'GST';

async function isGstBill(items) {
  // A line may reference the GST product by id or, when typed in, by name.
  if (items.some((item) => !numericId(item.product_id) && isGstName(item.product_id))) return true;
  const pIds = items.map((item) => numericId(item.product_id)).filter(Boolean);
  if (!pIds.length) return false;
  const products = await collection('products').find({ id: { $in: pIds } }).toArray();
  return products.some((product) => isGstName(product.productname));
}

async function itemDocuments(invoiceId, items = []) {
  if (!items.length) return [];

  // 1. Resolve any text-based product names in one fast batch
  const productMap = new Map();
  const unknownNames = [];

  for (const item of items) {
    const pId = numericId(item.product_id);
    if (pId) {
      productMap.set(String(pId), pId);
    } else if (item.product_id) {
      unknownNames.push(String(item.product_id).trim());
    }
  }

  if (unknownNames.length > 0) {
    const regexes = unknownNames.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i'));
    const existingProds = await collection('products')
      .find({ productname: { $in: regexes } })
      .toArray();

    for (const ep of existingProds) {
      productMap.set(ep.productname.toLowerCase(), ep.id);
    }

    const missingNames = [...new Set(unknownNames)].filter((n) => !productMap.has(n.toLowerCase()));
    if (missingNames.length > 0) {
      const newIds = await nextIds('products', missingNames.length);
      const newProds = missingNames.map((name, i) => ({
        id: newIds[i],
        productname: name,
        created_at: now(),
      }));
      await collection('products').insertMany(newProds);
      for (let i = 0; i < missingNames.length; i += 1) {
        productMap.set(missingNames[i].toLowerCase(), newIds[i]);
      }
    }
  }

  // 2. Allocate all item IDs in one single atomic step
  const itemIds = await nextIds('invoice_items', items.length);

  return items.map((item, idx) => {
    let pId = numericId(item.product_id);
    if (!pId && item.product_id) {
      pId = productMap.get(String(item.product_id).trim().toLowerCase()) || 0;
    }
    return {
      id: itemIds[idx],
      invoice_id: invoiceId,
      product_id: pId || 0,
      description: item.description || null,
      rate: Number(item.rate),
      quantity: Number(item.quantity),
      total: lineTotal(item),
      created_at: now(),
      updated_at: now(),
    };
  });
}

async function create(req, res) {
  const invalid = validatePayload(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  const { invoice_no, invoice_date, customer_id, customer_contact, items, paid_amount, payment_type, payment_status, status } = req.body;
  const { subAmount, dueAmount } = computeTotals(items, paid_amount);
  const id = await nextId('invoices');

  try {
    let custId = numericId(customer_id);
    let customer = custId ? await collection('customers').findOne({ id: custId }) : null;
    if (!customer && (req.body.company_name || customer_id)) {
      const name = String(req.body.company_name || customer_id).trim();
      if (name) {
        let existing = await collection('customers').findOne({ companyname: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
        if (!existing) {
          custId = await nextId('customers');
          existing = { id: custId, companyname: name, person_incharge: null, mobile_no: customer_contact || null, email: null, address: null, created_at: now(), updated_at: now() };
          await collection('customers').insertOne(existing);
        }
        customer = existing;
        custId = existing.id;
      }
    }
    if (!customer) return res.status(400).json({ message: 'Selected company/customer was not found. Please choose or enter an existing customer.' });

    const gstBill = await isGstBill(items);
    if (gstOnly(req, 'create') && !gstBill) return res.status(400).json({ message: GST_REQUIRED_MESSAGE });
    const docs = await itemDocuments(id, items);

    await collection('invoices').insertOne({
      id,
      invoice_no: String(invoice_no).trim(),
      invoice_date,
      customer_id: custId,
      customer_contact: customer_contact || null,
      sub_amount: subAmount,
      paid_amount: Number(paid_amount || 0),
      due_amount: dueAmount,
      payment_type: payment_type || null,
      payment_status: payment_status || null,
      status: (status && String(status).toLowerCase() === 'pending') ? 'Unpaid' : (status || 'Unpaid'),
      is_gst_bill: gstBill ? 1 : 0,
      is_deleted: false,
      deleted_at: null,
      version: 0,
      created_at: now(),
      updated_at: now(),
    });

    if (docs.length > 0) {
      await collection('invoice_items').insertMany(docs);
    }
    invalidateCounts();
    res.status(201).json({ id });
  } catch (error) {
    if (isDuplicateError(error)) return res.status(409).json({ message: 'Invoice number already exists' });
    throw error;
  }
}

async function update(req, res) {
  const invalid = validatePayload(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  const { invoice_no, invoice_date, customer_id, customer_contact, items, paid_amount, payment_type, payment_status, status, expected_version } = req.body;
  const { subAmount, dueAmount } = computeTotals(items, paid_amount);
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid invoice ID' });

  try {
    const existing = await collection('invoices').findOne({ id });
    if (!existing) return res.status(404).json({ message: 'Invoice not found' });
    const gstScoped = gstOnly(req, 'edit');
    if (gstScoped && !isGstInvoice(existing)) return res.status(403).json({ message: GST_SCOPE_MESSAGE });
    const currentVersion = Number(existing.version || 0);
    if (expected_version !== undefined && expected_version !== null && Number(expected_version) !== currentVersion) {
      return res.status(409).json({ message: 'This invoice was changed by someone else while you were editing. Reopen it to see the current version.' });
    }
    let custId = numericId(customer_id);
    let customer = custId ? await collection('customers').findOne({ id: custId }) : null;
    if (!customer && (req.body.company_name || customer_id)) {
      const name = String(req.body.company_name || customer_id).trim();
      if (name) {
        let match = await collection('customers').findOne({ companyname: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
        if (!match) {
          custId = await nextId('customers');
          match = { id: custId, companyname: name, person_incharge: null, mobile_no: customer_contact || null, email: null, address: null, created_at: now(), updated_at: now() };
          await collection('customers').insertOne(match);
        }
        customer = match;
        custId = match.id;
      }
    }
    if (!customer) return res.status(400).json({ message: 'Customer not found' });

    const gstBill = await isGstBill(items);
    if (gstScoped && !gstBill) return res.status(400).json({ message: GST_REQUIRED_MESSAGE });
    const docs = await itemDocuments(id, items);

    await collection('invoices').updateOne(
      { id },
      {
        $set: {
          invoice_no: String(invoice_no).trim(),
          invoice_date,
          customer_id: custId,
          customer_contact: customer_contact || null,
          sub_amount: subAmount,
          paid_amount: Number(paid_amount || 0),
          due_amount: dueAmount,
          payment_type: payment_type || null,
          payment_status: payment_status || null,
          status: (status && String(status).toLowerCase() === 'pending') ? 'Unpaid' : (status || (existing.status && String(existing.status).toLowerCase() === 'pending' ? 'Unpaid' : (existing.status || 'Unpaid'))),
          is_gst_bill: gstBill ? 1 : 0,
          updated_at: now(),
        },
        $inc: { version: 1 },
      }
    );
    await collection('invoice_items').deleteMany({ invoice_id: id });
    if (docs.length > 0) {
      await collection('invoice_items').insertMany(docs);
    }
    invalidateCounts();
    invalidateInvoicePdfCache(id);
    res.json({ id });
  } catch (error) {
    if (isDuplicateError(error)) return res.status(409).json({ message: 'Invoice number already exists' });
    throw error;
  }
}

async function patchStatus(req, res) {
  if (!req.body.status) return res.status(400).json({ message: 'status is required' });
  const id = numericId(req.params.id);
  if (await blockedByGstScope(req, 'edit', id)) return res.status(403).json({ message: GST_SCOPE_MESSAGE });
  const newStatus = (req.body.status && String(req.body.status).toLowerCase() === 'pending') ? 'Unpaid' : req.body.status;
  const result = await collection('invoices').updateOne({ id }, { $set: { status: newStatus, updated_at: now() } });
  if (!result.matchedCount) return res.status(404).json({ message: 'Invoice not found' });
  invalidateCounts();
  invalidateInvoicePdfCache(id);
  res.json({ message: 'Status updated' });
}

// Move to trash (soft delete)
async function remove(req, res) {
  const id = numericId(req.params.id);
  if (await blockedByGstScope(req, 'delete', id)) return res.status(403).json({ message: GST_SCOPE_MESSAGE });
  const result = await collection('invoices').updateOne(
    { id },
    { $set: { is_deleted: true, deleted_at: now(), updated_at: now() } }
  );
  if (!result.matchedCount) return res.status(404).json({ message: 'Invoice not found' });
  invalidateCounts();
  invalidateInvoicePdfCache(id);
  res.json({ message: 'Invoice moved to trash' });
}

// Restore from trash
async function restore(req, res) {
  const id = numericId(req.params.id);
  if (await blockedByGstScope(req, 'delete', id)) return res.status(403).json({ message: GST_SCOPE_MESSAGE });
  const result = await collection('invoices').updateOne(
    { id },
    { $set: { is_deleted: false, deleted_at: null, updated_at: now() } }
  );
  if (!result.matchedCount) return res.status(404).json({ message: 'Invoice not found' });
  invalidateCounts();
  invalidateInvoicePdfCache(id);
  res.json({ message: 'Invoice restored successfully' });
}

// Permanent delete from trash
async function permanentDelete(req, res) {
  const id = numericId(req.params.id);
  if (await blockedByGstScope(req, 'delete', id)) return res.status(403).json({ message: GST_SCOPE_MESSAGE });
  const result = await collection('invoices').deleteOne({ id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Invoice not found' });
  await collection('invoice_items').deleteMany({ invoice_id: id });
  invalidateCounts();
  invalidateInvoicePdfCache(id);
  res.json({ message: 'Invoice permanently deleted' });
}

/* ============================================================
 * Print — Optimized with:
 *   1. LRU in-memory buffer cache (<5ms)
 *   2. Instant buildPdf with preloaded font buffers (<30ms)
 *   3. Fresh cache headers (never serves stale PDFs after edit)
 * ============================================================ */

/**
 * Build (or fetch from the LRU cache) the invoice PDF buffer.
 * Shared by print() and emailInvoice().
 */
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

  const [invoice, settings] = await Promise.all([
    getInvoiceWithItems(id),
    getCompanySettings(),
  ]);

  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  if (gstOnly(req, 'print') && !isGstInvoice(invoice)) return res.status(403).json({ message: GST_SCOPE_MESSAGE });

  const cacheKey = getInvoicePdfCacheKey(invoice);
  const etag = computeETag(cacheKey);

  // ETag match — browser already has this exact version of PDF
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  // Common headers: ensure fresh responses and no stale browser cache
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoice_no}.pdf"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('ETag', etag);

  // Try cache first (LRU)
  const cachedBuffer = lruGet(cacheKey);
  if (cachedBuffer) {
    res.setHeader('Content-Length', cachedBuffer.length);
    return res.send(cachedBuffer);
  }

  // Direct fast in-memory PDF generation
  const docDef = invoicePdfDefinition(invoice, invoice.items || [], settings);
  const buffer = await buildPdf(docDef);
  lruSet(cacheKey, buffer);
  res.setHeader('Content-Length', buffer.length);
  return res.send(buffer);
}

/* ============================================================
 * Email — send the invoice PDF to the customer's email address
 * ============================================================ */

async function emailInvoice(req, res) {
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid invoice ID' });

  if (!isMailConfigured()) {
    return res.status(400).json({
      message: 'Email sending is not configured on the server. Add SMTP_USER and SMTP_PASS to the server .env.',
    });
  }

  const [invoice, settings] = await Promise.all([
    getInvoiceWithItems(id),
    getCompanySettings(),
  ]);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  if (gstOnly(req, 'print') && !isGstInvoice(invoice)) return res.status(403).json({ message: GST_SCOPE_MESSAGE });

  // "To" — one or many addresses; falls back to the customer's email on file.
  let toList = parseEmails(req.body?.email ?? req.body?.to);
  if (toList.length === 0) toList = parseEmails(invoice.customer_email);
  const ccList = parseEmails(req.body?.cc);

  if (toList.length === 0) {
    console.warn(`[email] invoice ${id}: no recipient (customer_email=${JSON.stringify(invoice.customer_email)})`);
    return res.status(400).json({
      message: `No email address on file for ${invoice.companyname || 'this customer'}. Enter a recipient email.`,
    });
  }
  const invalidTo = toList.filter((e) => !EMAIL_RE.test(e));
  if (invalidTo.length) {
    console.warn(`[email] invoice ${id}: invalid recipient(s): ${invalidTo.join(', ')}`);
    return res.status(400).json({ message: `Invalid recipient email: ${invalidTo.join(', ')}` });
  }
  const invalidCc = ccList.filter((e) => !EMAIL_RE.test(e));
  if (invalidCc.length) {
    console.warn(`[email] invoice ${id}: invalid CC: ${invalidCc.join(', ')}`);
    return res.status(400).json({ message: `Invalid CC email: ${invalidCc.join(', ')}` });
  }

  const buffer = await buildInvoicePdfBuffer(invoice, settings);
  const { subject, text, html } = buildInvoiceEmail(invoice, settings);

  try {
    await sendMail({
      to: toList,
      cc: ccList,
      subject,
      text,
      html,
      attachments: [
        {
          filename: `Invoice-${invoice.invoice_no || invoice.id}.pdf`,
          content: buffer,
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err) {
    const status = err.statusCode || 502;
    return res.status(status).json({ message: err.message || 'Failed to send the email. Please try again.' });
  }

  const summary = toList.join(', ') + (ccList.length ? ` (cc: ${ccList.join(', ')})` : '');
  res.json({ message: `Invoice #${invoice.invoice_no} emailed to ${summary}`, to: toList, cc: ccList });
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
  emailInvoice,
  cleanupExpiredTrash,
};
