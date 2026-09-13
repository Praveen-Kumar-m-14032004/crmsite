function requirePermission(code) {
  return (req, res, next) => {
    const permissions = req.user?.permissions || [];
    if (!permissions.includes(code)) {
      return res.status(403).json({ message: `Missing permission: ${code}` });
    }
    next();
  };
}

module.exports = requirePermission;
