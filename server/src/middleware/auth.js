const jwt = require('jsonwebtoken');
const { resolveAccess } = require('../utils/authz');

const DEFAULT_JWT_SECRET = 'permit-declaration-secret-da41d4f289e9d0410ad09455e84f577c';

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  let payload;
  try {
    const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    payload = jwt.verify(token, secret); // { id, username, roleId, roleName, permissions }
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // The token only proves who is calling. Role and permissions are read live so
  // that admin changes (or a deactivation) take effect without a fresh login.
  try {
    const access = await resolveAccess(payload.id);
    if (!access) {
      return res.status(401).json({ message: 'This account no longer exists. Please sign in again.' });
    }
    if (!access.isActive) {
      return res.status(401).json({ message: 'This account has been deactivated.' });
    }
    const { isActive, ...user } = access;
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticate;
