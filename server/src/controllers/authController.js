const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { collection } = require('../utils/mongo');
const { seedDefaults } = require('../utils/seedHelper');

const DEFAULT_JWT_SECRET = 'permit-declaration-secret-da41d4f289e9d0410ad09455e84f577c';

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

  const trimmedUsername = String(username).trim();
  const defaultAdminUser = (process.env.ADMIN_USERNAME || 'admin').trim();
  const defaultAdminPass = process.env.ADMIN_PASSWORD || 'admin';
  const isAdminLoginAttempt =
    trimmedUsername.toLowerCase() === defaultAdminUser.toLowerCase() &&
    password === defaultAdminPass;

  let user = await collection('users').findOne({
    username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') },
  });

  // If user not found and this is an admin login attempt with default admin credentials,
  // auto-provision admin user and system roles
  if (!user && isAdminLoginAttempt) {
    try {
      await seedDefaults();
      user = await collection('users').findOne({
        username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') },
      });
    } catch (seedErr) {
      console.error('[auth] auto-seed error:', seedErr);
    }
  }

  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  let match = await bcrypt.compare(password, user.password);

  // If password didn't match, but valid admin credentials were submitted, heal the stored hash
  if (!match && isAdminLoginAttempt && user.role_id === 1) {
    try {
      await seedDefaults();
      user = await collection('users').findOne({
        username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') },
      });
      match = user ? await bcrypt.compare(password, user.password) : false;
    } catch (seedErr) {
      console.error('[auth] auto-seed heal error:', seedErr);
    }
  }

  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const role = await collection('roles').findOne({ id: user.role_id });
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

  const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  const token = jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  res.json({ token, user: payload });
}

async function logout(_req, res) {
  // Stateless JWT - client just discards the token.
  res.json({ message: 'Logged out' });
}

module.exports = { login, logout, getPermissionsForRole };
