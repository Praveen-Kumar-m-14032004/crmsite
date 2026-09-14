const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { collection } = require('../utils/mongo');

async function getPermissionsForRole(roleId) {
  const links = await collection('role_permissions').find({ role_id: roleId }).toArray();
  const permissions = await collection('permissions').find({
    id: { $in: links.map((link) => link.permission_id) },
  }).toArray();
  return permissions.map((permission) => permission.code);
}

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const user = await collection('users').findOne({ username });
  const role = user ? await collection('roles').findOne({ id: user.role_id }) : null;
  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const permissions = role ? await getPermissionsForRole(user.role_id) : [];

  const payload = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    roleId: user.role_id,
    roleName: role?.name,
    permissions,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  res.json({ token, user: payload });
}

async function logout(_req, res) {
  // Stateless JWT - client just discards the token.
  res.json({ message: 'Logged out' });
}

module.exports = { login, logout, getPermissionsForRole };
