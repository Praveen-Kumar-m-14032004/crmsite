const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne } = require('../utils/db');
const { getPermissionsForRole } = require('../utils/authz');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
}

const USER_SQL = 'SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.username = ? LIMIT 1';

/**
 * Every account, Admin included, signs in with the password stored for it.
 * The first Admin is created by the seeder from ADMIN_USERNAME / ADMIN_PASSWORD
 * when no such user exists; after that the password is changed in Manage Users.
 */
async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const user = await queryOne(USER_SQL, [String(username).trim()]);
  // Compare against a dummy hash when the user is unknown so timing does not reveal valid usernames.
  const hash = user?.password || '$2a$10$CwTycUXWue0Thq9StjUM0uJ8ZzJ0bHdU8S0NyS7rQ7lqRzR0Zr5De';
  const match = await bcrypt.compare(password, hash);
  if (!user || !match || !user.is_active) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const permissions = user.role_id ? await getPermissionsForRole(user.role_id) : [];

  const payload = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    roleId: user.role_id,
    roleName: user.role_name || null,
    permissions,
  };

  res.json({ token: signToken(payload), user: payload });
}

// Current account with permissions as they are right now (the auth middleware
// already resolved them live), so the client can refresh what it cached at login.
async function me(req, res) {
  const { id, name, username, email, roleId, roleName, permissions } = req.user;
  res.json({ user: { id, name, username, email, roleId, roleName, permissions } });
}

async function logout(_req, res) {
  // Stateless JWT - client just discards the token.
  res.json({ message: 'Logged out' });
}

module.exports = { login, logout, me, getPermissionsForRole };
