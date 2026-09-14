const { getClient } = require('../config/db');
const { collection, nextId, now, numericId, isDuplicateError } = require('../utils/mongo');
const { buildPdf, invoicePdfDefinition } = require('../utils/pdf');
const { invalidate } = require('../utils/cache');

let totalCache = null;
const TOTAL_TTL_MS = 30000;
const invalidateTotal = () => { totalCache = null; invalidate('dashboard:'); };
async function totalInvoices() {
  if (totalCache && Date.now() - totalCache.at < TOTAL_TTL_MS) return totalCache.value;
  const value = await collection('invoices').countDocuments();
  totalCache = { value, at: Date.now() };
  return value;
}
async function nextNumber(_req, res) {
  const invoices = await collection('invoices').find({}, { projection: { invoice_no: 1 } }).toArray();
  const max = invoices.reduce((highest, invoice) => Math.max(highest, Number(invoice.invoice_no) || 0), 0);
  res.json({ invoice_no: String(max + 1) });
}
const customerLookup = () => [{ $lookup: { from: 'customers', localField: 'customer_id', foreignField: 'id', as: 'customer' } }, { $unwind: '$customer' }];
const projection = () => ({ id: 1, invoice_no: 1, invoice_date: 1, customer_id: 1, customer_contact: 1, sub_amount: 1, paid_amount: 1, due_amount: 1, payment_type: 1, payment_status: 1, status: 1, is_gst_bill: 1, version: 1, created_at: 1, updated_at: 1, companyname: '$customer.companyname' });

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'invoice_date', dir = 'desc' } = req.query;
  const sortable = ['invoice_date', 'invoice_no', 'sub_amount', 'due_amount', 'created_at'];
  const sortCol = sortable.includes(sort) ? sort : 'invoice_date';
  const sortDir = String(dir).toLowerCase() === 'asc' ? 1 : -1;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const pipeline = customerLookup();
  if (String(search).trim()) {
    const regex = { $regex: String(search).trim(), $options: 'i' };
    pipeline.push({ $match: { $or: [{ invoice_no: regex }, { 'customer.companyname': regex }, { customer_contact: regex }] } });
  }
  const [result] = await collection('invoices').aggregate([...pipeline, { $facet: { data: [{ $sort: { [sortCol]: sortDir, id: sortDir } }, { $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }, { $project: projection() }], count: [{ $count: 'total' }] } }]).toArray();
  const filteredTotal = result.count[0]?.total || 0;
  res.json({ data: result.data, total: String(search).trim() ? filteredTotal : await totalInvoices(), page: pageNum, limit: limitNum });
}

async function getInvoiceWithItems(id) {
  const [invoice] = await collection('invoices').aggregate([...customerLookup(), { $match: { id } }, { $project: { ...projection(), person_incharge: '$customer.person_incharge', customer_address: '$customer.address', customer_mobile: '$customer.mobile_no' } }]).toArray();
  if (!invoice) return null;
  const items = await collection('invoice_items').aggregate([{ $match: { invoice_id: id } }, { $lookup: { from: 'products', localField: 'product_id', foreignField: 'id', as: 'product' } }, { $unwind: '$product' }, { $project: { id: 1, invoice_id: 1, product_id: 1, description: 1, rate: 1, quantity: 1, total: 1, productname: '$product.productname' } }]).toArray();
  return { ...invoice, items };
}
async function getOne(req, res) {
  const invoice = await getInvoiceWithItems(numericId(req.params.id));
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  res.json(invoice);
}
const MAX_AMOUNT = 9999999999;
const MAX_ITEMS = 200;
const round2 = (number) => Math.round((number + Number.EPSILON) * 100) / 100;
const lineTotal = (item) => round2(Number(item.rate) * Number(item.quantity));
const computeTotals = (items, paid) => { const subAmount = round2(items.reduce((sum, item) => sum + lineTotal(item), 0)); return { subAmount, dueAmount: round2(Math.max(subAmount - Number(paid || 0), 0)) }; };
function validatePayload(body) {
  const { invoice_no, invoice_date, customer_id, items, paid_amount } = body;
  const missing = [];
  if (!String(invoice_no || '').trim()) missing.push('invoice_no');
  if (!String(invoice_date || '').trim()) missing.push('invoice_date');
  if (!numericId(customer_id)) missing.push('customer_id');
  if (!Array.isArray(items) || !items.length) missing.push('at least one item');
  if (missing.length) return `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(invoice_date))) return 'invoice_date must be a valid date (YYYY-MM-DD)';
  if (items.length > MAX_ITEMS) return `An invoice cannot have more than ${MAX_ITEMS} line items`;
  for (let index = 0; index < items.length; index += 1) { const rate = Number(items[index].rate); const quantity = Number(items[index].quantity); if (!items[index].product_id) return `Line ${index + 1}: a product must be selected`; if (!Number.isFinite(rate) || rate < 0 || rate > MAX_AMOUNT) return `Line ${index + 1}: rate must be a number between 0 and ${MAX_AMOUNT}`; if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_AMOUNT) return `Line ${index + 1}: quantity must be greater than 0`; }
  const paid = Number(paid_amount || 0); const { subAmount } = computeTotals(items, 0); if (!Number.isFinite(paid) || paid < 0) return 'paid_amount cannot be negative'; if (subAmount > MAX_AMOUNT) return 'Invoice total is too large'; if (paid > subAmount) return 'paid_amount cannot be more than the invoice total'; return null;
}
async function isGstBill(items, session) { const products = await collection('products').find({ id: { $in: items.map((item) => numericId(item.product_id)) } }, { session }).toArray(); return products.some((product) => product.productname === 'GST'); }
async function itemDocuments(invoiceId, items, session) { const docs = items.map((item) => ({ id: null, invoice_id: invoiceId, product_id: numericId(item.product_id), description: item.description || null, rate: Number(item.rate), quantity: Number(item.quantity), total: lineTotal(item) })); for (const item of docs) item.id = await nextId('invoice_items', session); return docs; }

async function create(req, res) {
  const invalid = validatePayload(req.body); if (invalid) return res.status(400).json({ message: invalid });
  const { invoice_no, invoice_date, customer_id, customer_contact, items, paid_amount, payment_type, payment_status, status } = req.body; const { subAmount, dueAmount } = computeTotals(items, paid_amount); const session = getClient().startSession(); let id;
  try { await session.withTransaction(async () => { id = await nextId('invoices', session); if (!await collection('customers').findOne({ id: numericId(customer_id) }, { session })) throw Object.assign(new Error('Customer not found'), { status: 400 }); const gstBill = await isGstBill(items, session); await collection('invoices').insertOne({ id, invoice_no: String(invoice_no).trim(), invoice_date, customer_id: numericId(customer_id), customer_contact: customer_contact || null, sub_amount: subAmount, paid_amount: Number(paid_amount || 0), due_amount: dueAmount, payment_type: payment_type || null, payment_status: payment_status || null, status: status || 'Pending', is_gst_bill: gstBill ? 1 : 0, version: 0, created_at: now(), updated_at: now() }, { session }); await collection('invoice_items').insertMany(await itemDocuments(id, items, session), { session }); }); invalidateTotal(); res.status(201).json({ id }); } catch (error) { if (isDuplicateError(error)) return res.status(409).json({ message: 'Invoice number already exists' }); throw error; } finally { await session.endSession(); }
}

async function update(req, res) {
  const invalid = validatePayload(req.body); if (invalid) return res.status(400).json({ message: invalid });
  const { invoice_no, invoice_date, customer_id, customer_contact, items, paid_amount, payment_type, payment_status, status, expected_version } = req.body; const { subAmount, dueAmount } = computeTotals(items, paid_amount); const id = numericId(req.params.id); const session = getClient().startSession(); let notFound = false; let conflict = false;
  try { await session.withTransaction(async () => { const existing = await collection('invoices').findOne({ id }, { session }); if (!existing) { notFound = true; return; } if (expected_version !== undefined && Number(expected_version) !== existing.version) { conflict = true; return; } if (!await collection('customers').findOne({ id: numericId(customer_id) }, { session })) throw Object.assign(new Error('Customer not found'), { status: 400 }); const gstBill = await isGstBill(items, session); const result = await collection('invoices').updateOne({ id, version: existing.version }, { $set: { invoice_no: String(invoice_no), invoice_date, customer_id: numericId(customer_id), customer_contact: customer_contact || null, sub_amount: subAmount, paid_amount: Number(paid_amount || 0), due_amount: dueAmount, payment_type: payment_type || null, payment_status: payment_status || null, status: status || existing.status, is_gst_bill: gstBill ? 1 : 0, updated_at: now() }, $inc: { version: 1 } }, { session }); if (!result.modifiedCount) { conflict = true; return; } await collection('invoice_items').deleteMany({ invoice_id: id }, { session }); await collection('invoice_items').insertMany(await itemDocuments(id, items, session), { session }); }); if (notFound) return res.status(404).json({ message: 'Invoice not found' }); if (conflict) return res.status(409).json({ message: 'This invoice was changed by someone else while you were editing. Reopen it to see the current version.' }); invalidateTotal(); res.json({ id }); } catch (error) { if (isDuplicateError(error)) return res.status(409).json({ message: 'Invoice number already exists' }); throw error; } finally { await session.endSession(); }
}
async function patchStatus(req, res) { if (!req.body.status) return res.status(400).json({ message: 'status is required' }); const result = await collection('invoices').updateOne({ id: numericId(req.params.id) }, { $set: { status: req.body.status, updated_at: now() } }); if (!result.matchedCount) return res.status(404).json({ message: 'Invoice not found' }); invalidateTotal(); res.json({ message: 'Status updated' }); }
async function remove(req, res) { const id = numericId(req.params.id); const result = await collection('invoices').deleteOne({ id }); if (!result.deletedCount) return res.status(404).json({ message: 'Invoice not found' }); await collection('invoice_items').deleteMany({ invoice_id: id }); invalidateTotal(); res.json({ message: 'Invoice deleted' }); }
async function print(req, res) { const invoice = await getInvoiceWithItems(numericId(req.params.id)); if (!invoice) return res.status(404).json({ message: 'Invoice not found' }); const settings = await collection('company_settings').findOne({}) || {}; const pdfBuffer = await buildPdf(invoicePdfDefinition(invoice, invoice.items, settings)); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoice_no}.pdf"`); res.send(pdfBuffer); }
module.exports = { nextNumber, list, getOne, create, update, patchStatus, remove, print };
