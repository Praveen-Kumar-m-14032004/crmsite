const bcrypt = require('bcryptjs');
const { collection, nextId, now, numericId, isDuplicateError } = require('../utils/mongo');

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
  const { name, username, email, password, role_id } = req.body;
  if (!username || !password || !role_id) {
    return res.status(400).json({ message: 'username, password and role_id are required' });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const id = await nextId('users');
    await collection('users').insertOne({ id, name: name || null, username, email: email || null, password: hash, role_id: numericId(role_id), is_active: 1, created_at: now() });
    res.status(201).json({ id });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ message: 'Username already exists' });
    }
    throw err;
  }
}

async function update(req, res) {
  const { name, email, role_id, is_active, password } = req.body;

  const fields = {};
  if (name !== undefined) fields.name = name;
  if (email !== undefined) fields.email = email;
  if (role_id !== undefined) fields.role_id = numericId(role_id);
  if (is_active !== undefined) fields.is_active = is_active ? 1 : 0;
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    fields.password = hash;
  }

  if (!Object.keys(fields).length) return res.status(400).json({ message: 'No fields to update' });

  const result = await collection('users').updateOne({ id: numericId(req.params.id) }, { $set: fields });
  if (!result.matchedCount) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User updated' });
}

async function remove(req, res) {
  const result = await collection('users').deleteOne({ id: numericId(req.params.id) });
  if (!result.deletedCount) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User deleted' });
}

module.exports = { list, create, update, remove };
