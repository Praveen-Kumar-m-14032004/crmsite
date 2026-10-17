const { query, queryOne, execute, withTransaction, now, numericId, isDuplicateError } = require('../utils/db');
const { invalidateRoleAccess, ADMIN_ROLE_ID } = require('../utils/authz');

const MAX_NAME = 40;
const MAX_DESCRIPTION = 200;

function cleanText(value, max) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

/** Normalise the submitted permission ids: unique, numeric and actually defined. */
async function resolvePermissionIds(raw) {
  const ids = [...new Set((Array.isArray(raw) ? raw : []).map(numericId).filter(Boolean))];
  if (!ids.length) return { ids };
  const known = await query('SELECT id FROM permissions WHERE id IN (?)', [ids]);
  const knownIds = new Set(known.map((p) => p.id));
  const unknown = ids.filter((id) => !knownIds.has(id));
  if (unknown.length) return { error: `Unknown permission id(s): ${unknown.join(', ')}` };
  return { ids };
}

async function list(_req, res) {
  const [roles, rolePerms, usersPerRole] = await Promise.all([
    query('SELECT * FROM roles ORDER BY id'),
    query('SELECT role_id, permission_id FROM role_permissions'),
    query('SELECT role_id, COUNT(*) AS n FROM users GROUP BY role_id'),
  ]);
  const userCount = new Map(usersPerRole.map((row) => [row.role_id, Number(row.n)]));

  res.json(roles.map((role) => ({
    ...role,
    permissionIds: rolePerms.filter((rp) => rp.role_id === role.id).map((rp) => rp.permission_id),
    userCount: userCount.get(role.id) || 0,
  })));
}

async function listPermissions(_req, res) {
  res.json(await query('SELECT * FROM permissions ORDER BY module, action'));
}

async function create(req, res) {
  const name = cleanText(req.body.name, MAX_NAME);
  const description = cleanText(req.body.description, MAX_DESCRIPTION) || null;
  if (!name) return res.status(400).json({ message: 'Role name is required' });

  if (await queryOne('SELECT id FROM roles WHERE name = ?', [name])) {
    return res.status(409).json({ message: `A role named "${name}" already exists` });
  }

  const { ids: permissionIds, error } = await resolvePermissionIds(req.body.permissionIds);
  if (error) return res.status(400).json({ message: error });

  try {
    const roleId = await withTransaction(async (tx) => {
      const result = await tx.execute(
        'INSERT INTO roles (name, description, is_system, created_at) VALUES (?, ?, 0, ?)',
        [name, description, now()]
      );
      if (permissionIds.length) {
        await tx.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [permissionIds.map((pId) => [result.insertId, pId])]);
      }
      return result.insertId;
    });
    res.status(201).json({ id: roleId });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ message: `A role named "${name}" already exists` });
    }
    throw err;
  }
}

async function update(req, res) {
  const id = numericId(req.params.id);
  const role = id ? await queryOne('SELECT * FROM roles WHERE id = ?', [id]) : null;
  if (!role) return res.status(404).json({ message: 'Role not found' });

  // Built-in roles keep their name so the rest of the app can refer to them.
  const name = role.is_system ? role.name : cleanText(req.body.name ?? role.name, MAX_NAME);
  const description = req.body.description === undefined
    ? role.description
    : (cleanText(req.body.description, MAX_DESCRIPTION) || null);
  if (!name) return res.status(400).json({ message: 'Role name is required' });

  if (name.toLowerCase() !== String(role.name).toLowerCase()) {
    const clash = await queryOne('SELECT id FROM roles WHERE id <> ? AND name = ?', [id, name]);
    if (clash) return res.status(409).json({ message: `A role named "${name}" already exists` });
  }

  const { ids: permissionIds, error } = await resolvePermissionIds(req.body.permissionIds);
  if (error) return res.status(400).json({ message: error });

  if (id === ADMIN_ROLE_ID) {
    // Restricting Admin could lock everyone out of user and role management.
    const total = await queryOne('SELECT COUNT(*) AS n FROM permissions');
    if (permissionIds.length !== Number(total?.n)) {
      return res.status(400).json({ message: 'The Admin role always has every permission and cannot be restricted.' });
    }
  }

  try {
    await withTransaction(async (tx) => {
      await tx.execute('UPDATE roles SET name = ?, description = ?, updated_at = ? WHERE id = ?', [name, description, now(), id]);
      await tx.execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
      if (permissionIds.length) {
        await tx.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [permissionIds.map((pId) => [id, pId])]);
      }
    });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ message: `A role named "${name}" already exists` });
    }
    throw err;
  }

  invalidateRoleAccess(id);
  res.json({ message: 'Role updated' });
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  const role = id ? await queryOne('SELECT * FROM roles WHERE id = ?', [id]) : null;
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (role.is_system) return res.status(400).json({ message: 'Built-in roles cannot be deleted' });

  const inUse = Number((await queryOne('SELECT COUNT(*) AS n FROM users WHERE role_id = ?', [id]))?.n || 0);
  if (inUse) {
    return res.status(409).json({
      message: `${inUse} user${inUse === 1 ? ' is' : 's are'} still assigned to "${role.name}". Move them to another role first.`,
    });
  }

  await execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
  await execute('DELETE FROM roles WHERE id = ?', [id]);
  invalidateRoleAccess(id);
  res.json({ message: 'Role deleted' });
}

module.exports = { list, listPermissions, create, update, remove };
