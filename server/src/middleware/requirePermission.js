/**
 * Gate a route behind one permission code, or any one of several codes.
 * There are no implicit fallbacks between modules: what the Roles & Permissions
 * matrix shows is exactly what the API enforces.
 */
function requirePermission(code) {
  const codes = (Array.isArray(code) ? code : [code]).filter(Boolean);
  return (req, res, next) => {
    const permissions = req.user?.permissions || [];
    if (!codes.some((c) => permissions.includes(c))) {
      return res.status(403).json({ message: `Missing permission: ${codes.join(' or ')}` });
    }
    next();
  };
}

module.exports = requirePermission;
