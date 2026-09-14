const { getClient } = require('../config/db');
const { collection, nextId, now, numericId, isDuplicateError } = require('../utils/mongo');

async function list(_req, res) {
  const [roles, rolePerms] = await Promise.all([
    collection('roles').find().sort({ id: 1 }).toArray(),
    collection('role_permissions').find().toArray(),
  ]);

  const withPerms = roles.map((role) => ({
    ...role,
    permissionIds: rolePerms.filter((rp) => rp.role_id === role.id).map((rp) => rp.permission_id),
  }));

  res.json(withPerms);
}

async function listPermissions(_req, res) {
  const rows = await collection('permissions').find().sort({ module: 1, action: 1 }).toArray();
  res.json(rows);
}

async function create(req, res) {
  const { name, description, permissionIds = [] } = req.body;
  if (!name) return res.status(400).json({ message: 'Role name is required' });

  const session = getClient().startSession();
  try {
    const roleId = await nextId('roles', session);
    await session.withTransaction(async () => {
      await collection('roles').insertOne({ id: roleId, name, description: description || null, is_system: 0, created_at: now() }, { session });
      if (permissionIds.length) await collection('role_permissions').insertMany(permissionIds.map((permission_id) => ({ role_id: roleId, permission_id: Number(permission_id) })), { session });
    });
    res.status(201).json({ id: roleId });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ message: 'A role with this name already exists' });
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function update(req, res) {
  const { name, description, permissionIds = [] } = req.body;
  if (!name) return res.status(400).json({ message: 'Role name is required' });

  const session = getClient().startSession();
  const id = numericId(req.params.id);
  try {
    let found = false;
    await session.withTransaction(async () => {
      const result = await collection('roles').updateOne({ id }, { $set: { name, description: description || null } }, { session });
      found = result.matchedCount > 0;
      if (!found) return;
      await collection('role_permissions').deleteMany({ role_id: id }, { session });
      if (permissionIds.length) await collection('role_permissions').insertMany(permissionIds.map((permission_id) => ({ role_id: id, permission_id: Number(permission_id) })), { session });
    });
    if (!found) {
      return res.status(404).json({ message: 'Role not found' });
    }
    res.json({ message: 'Role updated' });
  } catch (err) {
    throw err;
  } finally {
    await session.endSession();
  }
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  const role = await collection('roles').findOne({ id });
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (role.is_system) return res.status(400).json({ message: 'System roles cannot be deleted' });

  await collection('roles').deleteOne({ id });
  await collection('role_permissions').deleteMany({ role_id: id });
  res.json({ message: 'Role deleted' });
}

module.exports = { list, listPermissions, create, update, remove };
