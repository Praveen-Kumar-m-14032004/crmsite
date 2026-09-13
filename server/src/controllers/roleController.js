const pool = require('../config/db');

async function list(_req, res) {
  const [roles] = await pool.query('SELECT * FROM roles ORDER BY id');
  const [rolePerms] = await pool.query('SELECT role_id, permission_id FROM role_permissions');

  const withPerms = roles.map((role) => ({
    ...role,
    permissionIds: rolePerms.filter((rp) => rp.role_id === role.id).map((rp) => rp.permission_id),
  }));

  res.json(withPerms);
}

async function listPermissions(_req, res) {
  const [rows] = await pool.query('SELECT * FROM permissions ORDER BY module, action');
  res.json(rows);
}

async function create(req, res) {
  const { name, description, permissionIds = [] } = req.body;
  if (!name) return res.status(400).json({ message: 'Role name is required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO roles (name, description, is_system) VALUES (?, ?, 0)',
      [name, description || null]
    );
    const roleId = result.insertId;
    for (const pid of permissionIds) {
      await conn.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, pid]);
    }
    await conn.commit();
    res.status(201).json({ id: roleId });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A role with this name already exists' });
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function update(req, res) {
  const { name, description, permissionIds = [] } = req.body;
  if (!name) return res.status(400).json({ message: 'Role name is required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'UPDATE roles SET name = ?, description = ? WHERE id = ?',
      [name, description || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Role not found' });
    }
    await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [req.params.id]);
    for (const pid of permissionIds) {
      await conn.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [req.params.id, pid]);
    }
    await conn.commit();
    res.json({ message: 'Role updated' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function remove(req, res) {
  const [[role]] = await pool.query('SELECT is_system FROM roles WHERE id = ?', [req.params.id]);
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (role.is_system) return res.status(400).json({ message: 'System roles cannot be deleted' });

  await pool.query('DELETE FROM roles WHERE id = ?', [req.params.id]);
  res.json({ message: 'Role deleted' });
}

module.exports = { list, listPermissions, create, update, remove };
