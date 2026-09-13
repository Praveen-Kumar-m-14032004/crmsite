const pool = require('../config/db');

async function list(req, res) {
  const { search = '', page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;
  const searchTerm = `%${search}%`;

  const [rows] = await pool.query(
    `SELECT * FROM products WHERE productname LIKE ?
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [searchTerm, limitNum, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM products WHERE productname LIKE ?`,
    [searchTerm]
  );

  res.json({ data: rows, total: countRows[0].total, page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Product not found' });
  res.json(rows[0]);
}

async function create(req, res) {
  const { productname } = req.body;
  if (!productname) return res.status(400).json({ message: 'Product name is required' });
  const [result] = await pool.query('INSERT INTO products (productname) VALUES (?)', [productname]);
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const { productname } = req.body;
  if (!productname) return res.status(400).json({ message: 'Product name is required' });
  await pool.query('UPDATE products SET productname = ? WHERE id = ?', [productname, req.params.id]);
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Product not found' });
  res.json(rows[0]);
}

async function remove(req, res) {
  const [result] = await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Product not found' });
  res.json({ message: 'Product deleted' });
}

module.exports = { list, getOne, create, update, remove };
