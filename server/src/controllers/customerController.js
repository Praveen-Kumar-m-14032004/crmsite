const pool = require('../config/db');

const SORTABLE = ['companyname', 'person_incharge', 'mobile_no', 'email', 'created_at'];

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'created_at', dir = 'desc' } = req.query;

  const sortCol = SORTABLE.includes(sort) ? sort : 'created_at';
  const sortDir = dir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const searchTerm = `%${search}%`;
  const [rows] = await pool.query(
    `SELECT * FROM customers
     WHERE companyname LIKE ? OR person_incharge LIKE ? OR email LIKE ? OR mobile_no LIKE ?
     ORDER BY ${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`,
    [searchTerm, searchTerm, searchTerm, searchTerm, limitNum, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM customers
     WHERE companyname LIKE ? OR person_incharge LIKE ? OR email LIKE ? OR mobile_no LIKE ?`,
    [searchTerm, searchTerm, searchTerm, searchTerm]
  );

  res.json({ data: rows, total: countRows[0].total, page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });
  res.json(rows[0]);
}

async function create(req, res) {
  const { companyname, person_incharge, mobile_no, email, address } = req.body;
  if (!companyname) return res.status(400).json({ message: 'Company name is required' });

  const [result] = await pool.query(
    `INSERT INTO customers (companyname, person_incharge, mobile_no, email, address)
     VALUES (?, ?, ?, ?, ?)`,
    [companyname, person_incharge || null, mobile_no || null, email || null, address || null]
  );
  const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [result.insertId]);
  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const { companyname, person_incharge, mobile_no, email, address } = req.body;
  if (!companyname) return res.status(400).json({ message: 'Company name is required' });

  await pool.query(
    `UPDATE customers SET companyname = ?, person_incharge = ?, mobile_no = ?, email = ?, address = ?
     WHERE id = ?`,
    [companyname, person_incharge || null, mobile_no || null, email || null, address || null, req.params.id]
  );
  const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });
  res.json(rows[0]);
}

async function remove(req, res) {
  const [result] = await pool.query('DELETE FROM customers WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Customer not found' });
  res.json({ message: 'Customer deleted' });
}

module.exports = { list, getOne, create, update, remove };
