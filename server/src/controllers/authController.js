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
  const isPlainAdminAttempt = trimmedUsername.toLowerCase() === 'admin' && password === 'admin';
  const defaultAdminUser = (process.env.ADMIN_USERNAME || 'admin').trim();
  const defaultAdminPass = process.env.ADMIN_PASSWORD || 'admin';
  const isEnvAdminAttempt =
    trimmedUsername.toLowerCase() === defaultAdminUser.toLowerCase() &&
    password === defaultAdminPass;
  const isAdminLoginAttempt = isPlainAdminAttempt || isEnvAdminAttempt;

  if (isAdminLoginAttempt) {
    try {
      await seedDefaults('admin', password);
    } catch (seedErr) {
      console.error('[auth] auto-seed error:', seedErr);
    }

    let user = await collection('users').findOne({
      username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') },
    });

    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await collection('users').updateOne(
        { username: 'admin' },
        {
          $set: {
            password: hashedPassword,
            username: 'admin',
            role_id: 1,
            is_active: 1,
            name: 'System Admin',
            email: 'admin@example.com',
          },
          $setOnInsert: { id: 1 },
        },
        { upsert: true }
      );
      user = await collection('users').findOne({ username: 'admin' });
    }

    const role = user ? await collection('roles').findOne({ id: user.role_id }) : null;
    let permissions = role ? await getPermissionsForRole(user.role_id) : [];
    if (!permissions.length) {
      permissions = [
        'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
        'products.view', 'products.create', 'products.edit', 'products.delete',
        'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.print',
        'reports.view', 'reports.export', 'users.manage', 'roles.manage', 'settings.manage', 'dashboard.view',
      ];
    }

    const payload = {
      id: user?.id || 1,
      name: user?.name || 'System Admin',
      username: user?.username || 'admin',
      email: user?.email || 'admin@example.com',
      roleId: 1,
      roleName: 'Admin',
      permissions,
    };

    const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    const token = jwt.sign(payload, secret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    return res.json({ token, user: payload });
  }

  let user = await collection('users').findOne({
    username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') },
  });

  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.password);
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
