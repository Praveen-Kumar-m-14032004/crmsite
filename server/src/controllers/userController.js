const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function list(req, res) {
  const { search = '', page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;
  const searchTerm = `%${search}%`;

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.username, u.email, u.is_active, u.created_at, r.id AS role_id, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ?
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [searchTerm, searchTerm, searchTerm, limitNum, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM users
     WHERE name LIKE ? OR username LIKE ? OR email LIKE ?`,
    [searchTerm, searchTerm, searchTerm]
  );

  res.json({ data: rows, total: countRows[0].total, page: pageNum, limit: limitNum });
}

async function create(req, res) {
  const { name, username, email, password, role_id } = req.body;
  if (!username || !password || !role_id) {
    return res.status(400).json({ message: 'username, password and role_id are required' });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const [result] = await pool.query(
      `INSERT INTO users (name, username, email, password, role_id, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [name || null, username, email || null, hash, role_id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Username already exists' });
    }
    throw err;
  }
}

async function update(req, res) {
  const { name, email, role_id, is_active, password } = req.body;

  const fields = [];
  const params = [];
  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (email !== undefined) { fields.push('email = ?'); params.push(email); }
  if (role_id !== undefined) { fields.push('role_id = ?'); params.push(role_id); }
  if (is_active !== undefined) { fields.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    fields.push('password = ?');
    params.push(hash);
  }

  if (!fields.length) return res.status(400).json({ message: 'No fields to update' });

  params.push(req.params.id);
  const [result] = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User updated' });
}

async function remove(req, res) {
  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User deleted' });
}

module.exports = { list, create, update, remove };
