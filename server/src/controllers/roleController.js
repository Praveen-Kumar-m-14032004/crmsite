const { getClient } = require('../config/db');
const { collection, nextId, now, numericId, isDuplicateError, syncCounter } = require('../utils/mongo');
const { invalidateRoleAccess, ADMIN_ROLE_ID } = require('../utils/authz');

const MAX_NAME = 40;
const MAX_DESCRIPTION = 200;

function cleanText(value, max) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function nameRegex(name) {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

/** Normalise the submitted permission ids: unique, numeric and actually defined. */
async function resolvePermissionIds(raw) {
  const ids = [...new Set((Array.isArray(raw) ? raw : []).map(numericId).filter(Boolean))];
  if (!ids.length) return { ids };
  const known = await collection('permissions').find({ id: { $in: ids } }, { projection: { id: 1 } }).toArray();
  const knownIds = new Set(known.map((p) => p.id));
  const unknown = ids.filter((id) => !knownIds.has(id));
  if (unknown.length) return { error: `Unknown permission id(s): ${unknown.join(', ')}` };
  return { ids };
}

async function list(_req, res) {
  const [roles, rolePerms, usersPerRole] = await Promise.all([
    collection('roles').find().sort({ id: 1 }).toArray(),
    collection('role_permissions').find().toArray(),
    collection('users').aggregate([{ $group: { _id: '$role_id', count: { $sum: 1 } } }]).toArray(),
  ]);
  const userCount = new Map(usersPerRole.map((row) => [row._id, row.count]));

  res.json(roles.map((role) => ({
    ...role,
    permissionIds: rolePerms.filter((rp) => rp.role_id === role.id).map((rp) => rp.permission_id),
    userCount: userCount.get(role.id) || 0,
  })));
}

async function listPermissions(_req, res) {
  const rows = await collection('permissions').find().sort({ module: 1, action: 1 }).toArray();
  res.json(rows);
}

async function create(req, res) {
  const name = cleanText(req.body.name, MAX_NAME);
  const description = cleanText(req.body.description, MAX_DESCRIPTION) || null;
  if (!name) return res.status(400).json({ message: 'Role name is required' });

  if (await collection('roles').findOne({ name: nameRegex(name) })) {
    return res.status(409).json({ message: `A role named "${name}" already exists` });
  }

  const { ids: permissionIds, error } = await resolvePermissionIds(req.body.permissionIds);
  if (error) return res.status(400).json({ message: error });

  // Seeded roles were written with fixed ids that bypass the counter; make sure
  // the counter is past them or the insert below would collide with "Admin".
  await syncCounter('roles');

  const session = getClient().startSession();
  try {
    const roleId = await nextId('roles', session);
    await session.withTransaction(async () => {
      await collection('roles').insertOne(
        { id: roleId, name, description, is_system: 0, created_at: now() },
        { session }
      );
      if (permissionIds.length) {
        await collection('role_permissions').insertMany(
          permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })),
          { session }
        );
      }
    });
    res.status(201).json({ id: roleId });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ message: `A role named "${name}" already exists` });
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function update(req, res) {
  const id = numericId(req.params.id);
  const role = id ? await collection('roles').findOne({ id }) : null;
  if (!role) return res.status(404).json({ message: 'Role not found' });

  // Built-in roles keep their name so the rest of the app can refer to them.
  const name = role.is_system ? role.name : cleanText(req.body.name ?? role.name, MAX_NAME);
  const description = req.body.description === undefined
    ? role.description
    : (cleanText(req.body.description, MAX_DESCRIPTION) || null);
  if (!name) return res.status(400).json({ message: 'Role name is required' });

  if (name.toLowerCase() !== String(role.name).toLowerCase()) {
    const clash = await collection('roles').findOne({ id: { $ne: id }, name: nameRegex(name) });
    if (clash) return res.status(409).json({ message: `A role named "${name}" already exists` });
  }

  const { ids: permissionIds, error } = await resolvePermissionIds(req.body.permissionIds);
  if (error) return res.status(400).json({ message: error });

  if (id === ADMIN_ROLE_ID) {
    // Restricting Admin could lock everyone out of user and role management.
    const total = await collection('permissions').countDocuments();
    if (permissionIds.length !== total) {
      return res.status(400).json({ message: 'The Admin role always has every permission and cannot be restricted.' });
    }
  }

  const session = getClient().startSession();
  try {
    await session.withTransaction(async () => {
      await collection('roles').updateOne({ id }, { $set: { name, description, updated_at: now() } }, { session });
      await collection('role_permissions').deleteMany({ role_id: id }, { session });
      if (permissionIds.length) {
        await collection('role_permissions').insertMany(
          permissionIds.map((permission_id) => ({ role_id: id, permission_id })),
          { session }
        );
      }
    });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ message: `A role named "${name}" already exists` });
    }
    throw err;
  } finally {
    await session.endSession();
  }

  invalidateRoleAccess(id);
  res.json({ message: 'Role updated' });
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  const role = id ? await collection('roles').findOne({ id }) : null;
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (role.is_system) return res.status(400).json({ message: 'Built-in roles cannot be deleted' });

  const inUse = await collection('users').countDocuments({ role_id: id });
  if (inUse) {
    return res.status(409).json({
      message: `${inUse} user${inUse === 1 ? ' is' : 's are'} still assigned to "${role.name}". Move them to another role first.`,
    });
  }

  await collection('roles').deleteOne({ id });
  await collection('role_permissions').deleteMany({ role_id: id });
  invalidateRoleAccess(id);
  res.json({ message: 'Role deleted' });
}

module.exports = { list, listPermissions, create, update, remove };
