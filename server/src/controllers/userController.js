const bcrypt = require('bcryptjs');
const { query, queryOne, execute, now, numericId, isDuplicateError, likeTerm } = require('../utils/db');
const { invalidateUserAccess, ADMIN_ROLE_ID } = require('../utils/authz');

const MIN_PASSWORD = 4;

async function roleExists(roleId) {
  const id = numericId(roleId);
  if (!id) return false;
  return Boolean(await queryOne('SELECT id FROM roles WHERE id = ?', [id]));
}

/**
 * True when applying `change` to `target` would leave the system with no active
 * Admin account, which would make user and role management unreachable.
 */
async function wouldRemoveLastAdmin(target, change) {
  const isAdminNow = target.role_id === ADMIN_ROLE_ID && Boolean(target.is_active);
  if (!isAdminNow) return false;
  const staysAdmin = !change.deleted
    && (change.role_id === undefined || change.role_id === ADMIN_ROLE_ID)
    && (change.is_active === undefined || change.is_active === 1);
  if (staysAdmin) return false;
  const row = await queryOne('SELECT COUNT(*) AS n FROM users WHERE id <> ? AND role_id = ? AND is_active = 1', [target.id, ADMIN_ROLE_ID]);
  return Number(row?.n) === 0;
}

async function list(req, res) {
  const { search = '', page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const term = String(search || '').trim();
  const where = term ? 'WHERE (u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)' : '';
  const params = term ? [likeTerm(term), likeTerm(term), likeTerm(term)] : [];

  const [rows, count] = await Promise.all([
    query(
      `SELECT u.id, u.name, u.username, u.email, u.role_id, u.is_active, u.created_at, u.updated_at, r.name AS role_name
         FROM users u LEFT JOIN roles r ON r.id = u.role_id
         ${where}
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    ),
    queryOne(`SELECT COUNT(*) AS n FROM users u ${where}`, params),
  ]);

  res.json({ data: rows, total: Number(count?.n || 0), page: pageNum, limit: limitNum });
}

async function create(req, res) {
  const { name, email, password, role_id } = req.body;
  const username = String(req.body.username || '').trim();
  if (!username || !password || !role_id) {
    return res.status(400).json({ message: 'username, password and role_id are required' });
  }
  if (String(password).length < MIN_PASSWORD) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });
  }
  if (!(await roleExists(role_id))) {
    return res.status(400).json({ message: 'Selected role does not exist' });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await execute(
      'INSERT INTO users (name, username, email, password, role_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [name ? String(name).trim() : null, username, email ? String(email).trim() : null, hash, numericId(role_id), now(), now()]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ message: 'Username already exists' });
    }
    throw err;
  }
}

async function update(req, res) {
  const id = numericId(req.params.id);
  const target = id ? await queryOne('SELECT * FROM users WHERE id = ?', [id]) : null;
  if (!target) return res.status(404).json({ message: 'User not found' });

  const { name, email, role_id, is_active, password } = req.body;
  const isSelf = req.user?.id === id;

  const fields = {};
  if (name !== undefined) fields.name = name;
  if (email !== undefined) fields.email = email;
  if (role_id !== undefined) {
    if (!(await roleExists(role_id))) return res.status(400).json({ message: 'Selected role does not exist' });
    fields.role_id = numericId(role_id);
  }
  if (is_active !== undefined) {
    fields.is_active = is_active ? 1 : 0;
    if (isSelf && !fields.is_active) return res.status(400).json({ message: 'You cannot deactivate your own account' });
  }
  if (password) {
    if (String(password).length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });
    }
    fields.password = await bcrypt.hash(password, 10);
  }

  if (!Object.keys(fields).length) return res.status(400).json({ message: 'No fields to update' });

  if (await wouldRemoveLastAdmin(target, fields)) {
    return res.status(400).json({ message: 'This is the last active Admin. Give another user the Admin role first.' });
  }

  fields.updated_at = now();
  const columns = Object.keys(fields);
  await execute(`UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...columns.map((c) => fields[c]), id]);
  invalidateUserAccess(id);
  res.json({ message: 'User updated' });
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  const target = id ? await queryOne('SELECT * FROM users WHERE id = ?', [id]) : null;
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (req.user?.id === id) return res.status(400).json({ message: 'You cannot delete your own account' });
  if (await wouldRemoveLastAdmin(target, { deleted: true })) {
    return res.status(400).json({ message: 'This is the last active Admin. Give another user the Admin role first.' });
  }

  await execute('DELETE FROM users WHERE id = ?', [id]);
  invalidateUserAccess(id);
  res.json({ message: 'User deleted' });
}

module.exports = { list, create, update, remove };
