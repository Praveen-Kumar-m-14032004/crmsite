const { query, queryOne, execute, now, numericId, likeTerm } = require('../utils/db');
const { hasPerm } = require('../utils/authz');
const { GST_PRODUCT_WHERE } = require('../utils/gst');

// Permissions that entitle a caller to the full product list. A caller who reaches
// the list route without any of them got in through gst_invoices.create/edit only
// (e.g. Supervisor) and is shown nothing but the GST product they may bill.
const FULL_LIST_PERMISSIONS = [
  'products.view',
  'invoices.create', 'invoices.edit',
  'quotations.create', 'quotations.edit',
];

async function list(req, res) {
  const { search = '', page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];
  const term = String(search || '').trim();
  if (term) {
    conditions.push('productname LIKE ?');
    params.push(likeTerm(term));
  }
  if (!FULL_LIST_PERMISSIONS.some((code) => hasPerm(req, code))) conditions.push(GST_PRODUCT_WHERE);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, count] = await Promise.all([
    query(`SELECT * FROM products ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, limitNum, offset]),
    queryOne(`SELECT COUNT(*) AS n FROM products ${where}`, params),
  ]);

  res.json({ data: rows, total: Number(count?.n || 0), page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const product = await queryOne('SELECT * FROM products WHERE id = ?', [numericId(req.params.id)]);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
}

async function create(req, res) {
  const productname = String(req.body.productname || '').trim();
  if (!productname) return res.status(400).json({ message: 'Product name is required' });
  const result = await execute('INSERT INTO products (productname, created_at) VALUES (?, ?)', [productname, now()]);
  res.status(201).json(await queryOne('SELECT * FROM products WHERE id = ?', [result.insertId]));
}

async function update(req, res) {
  const { productname } = req.body;
  if (!productname || !String(productname).trim()) return res.status(400).json({ message: 'Product name is required' });
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid product ID' });
  const result = await execute('UPDATE products SET productname = ?, updated_at = ? WHERE id = ?', [String(productname).trim(), now(), id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Product not found' });
  res.json(await queryOne('SELECT * FROM products WHERE id = ?', [id]));
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  if (await queryOne('SELECT id FROM invoice_items WHERE product_id = ? LIMIT 1', [id])) {
    return res.status(409).json({ message: 'This record is still used by existing invoices and cannot be deleted.' });
  }
  const result = await execute('DELETE FROM products WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Product not found' });
  res.json({ message: 'Product deleted' });
}

module.exports = { list, getOne, create, update, remove };
