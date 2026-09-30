const { collection, nextId, now, numericId, syncCounter } = require('../utils/mongo');
const { hasPerm } = require('../utils/authz');
const { GST_PRODUCT_FILTER } = require('../utils/gst');

// Permissions that entitle a caller to the full product list. A caller who reaches
// the list route without any of them got in through gst_invoices.create/edit only
// (e.g. Supervisor) and is shown nothing but the GST product they may bill.
const FULL_LIST_PERMISSIONS = [
  'products.view',
  'invoices.create', 'invoices.edit',
  'quotations.create', 'quotations.edit',
];

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function list(req, res) {
  const { search = '', page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (String(search).trim()) conditions.push({ productname: { $regex: escapeRegex(String(search).trim()), $options: 'i' } });
  if (!FULL_LIST_PERMISSIONS.some((code) => hasPerm(req, code))) conditions.push(GST_PRODUCT_FILTER);
  const filter = conditions.length ? { $and: conditions } : {};

  const [rows, total] = await Promise.all([
    collection('products').find(filter).sort({ created_at: -1, id: -1 }).skip(offset).limit(limitNum).toArray(),
    collection('products').countDocuments(filter),
  ]);

  res.json({ data: rows, total, page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const product = await collection('products').findOne({ id: numericId(req.params.id) });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
}

async function create(req, res) {
  const productname = String(req.body.productname || '').trim();
  if (!productname) return res.status(400).json({ message: 'Product name is required' });
  // Seeded products were written with fixed ids 1-8 that bypass the counter.
  await syncCounter('products');
  const product = { id: await nextId('products'), productname, created_at: now() };
  await collection('products').insertOne(product);
  res.status(201).json(product);
}

async function update(req, res) {
  const { productname } = req.body;
  if (!productname || !String(productname).trim()) return res.status(400).json({ message: 'Product name is required' });
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid product ID' });
  const result = await collection('products').findOneAndUpdate(
    { id },
    { $set: { productname: String(productname).trim(), updated_at: now() } },
    { returnDocument: 'after' }
  );
  const product = result?.value !== undefined && typeof result.value === 'object' ? result.value : result;
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  if (await collection('invoice_items').findOne({ product_id: id })) return res.status(409).json({ message: 'This record is still used by existing invoices and cannot be deleted.' });
  const result = await collection('products').deleteOne({ id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Product not found' });
  res.json({ message: 'Product deleted' });
}

module.exports = { list, getOne, create, update, remove };
