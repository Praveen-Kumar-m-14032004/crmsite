const bcrypt = require('bcryptjs');
const { collection, nextId, now, numericId, isDuplicateError, syncCounter } = require('../utils/mongo');
const { invalidateUserAccess, ADMIN_ROLE_ID } = require('../utils/authz');

const MIN_PASSWORD = 4;

async function roleExists(roleId) {
  const id = numericId(roleId);
  if (!id) return false;
  return Boolean(await collection('roles').findOne({ id }, { projection: { id: 1 } }));
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
  const otherAdmins = await collection('users').countDocuments({ id: { $ne: target.id }, role_id: ADMIN_ROLE_ID, is_active: 1 });
  return otherAdmins === 0;
}

async function list(req, res) {
  const { search = '', page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;
  const filter = search ? { $or: ['name', 'username', 'email'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) } : {};
  const [users, total] = await Promise.all([
    collection('users').find(filter).sort({ created_at: -1, id: -1 }).skip(offset).limit(limitNum).toArray(),
    collection('users').countDocuments(filter),
  ]);
  const roles = await collection('roles').find({ id: { $in: users.map((user) => user.role_id) } }).toArray();
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const rows = users.map(({ password, ...user }) => ({ ...user, role_name: roleById.get(user.role_id)?.name }));

  res.json({ data: rows, total, page: pageNum, limit: limitNum });
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
    await syncCounter('users');
    const id = await nextId('users');
    await collection('users').insertOne({
      id,
      name: name ? String(name).trim() : null,
      username,
      email: email ? String(email).trim() : null,
      password: hash,
      role_id: numericId(role_id),
      is_active: 1,
      created_at: now(),
    });
    res.status(201).json({ id });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ message: 'Username already exists' });
    }
    throw err;
  }
}

async function update(req, res) {
  const id = numericId(req.params.id);
  const target = id ? await collection('users').findOne({ id }) : null;
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

  await collection('users').updateOne({ id }, { $set: { ...fields, updated_at: now() } });
  invalidateUserAccess(id);
  res.json({ message: 'User updated' });
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  const target = id ? await collection('users').findOne({ id }) : null;
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (req.user?.id === id) return res.status(400).json({ message: 'You cannot delete your own account' });
  if (await wouldRemoveLastAdmin(target, { deleted: true })) {
    return res.status(400).json({ message: 'This is the last active Admin. Give another user the Admin role first.' });
  }

  await collection('users').deleteOne({ id });
  invalidateUserAccess(id);
  res.json({ message: 'User deleted' });
}

module.exports = { list, create, update, remove };
