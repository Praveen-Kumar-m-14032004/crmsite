const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'permit-declaration-secret-da41d4f289e9d0410ad09455e84f577c';
    const payload = jwt.verify(token, secret);
    req.user = payload; // { id, username, roleId, roleName, permissions }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = authenticate;
