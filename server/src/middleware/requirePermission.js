function requirePermission(code) {
  return (req, res, next) => {
    const permissions = req.user?.permissions || [];
    const codes = Array.isArray(code) ? code : [code];
    const hasAny = codes.some((c) => {
      if (permissions.includes(c)) return true;
      if (typeof c === 'string' && c.startsWith('quotations.')) {
        const invoicePerm = c.replace('quotations.', 'invoices.');
        if (permissions.includes(invoicePerm)) return true;
      }
      return false;
    });

    if (!hasAny) {
      return res.status(403).json({ message: `Missing permission: ${codes.join(' or ')}` });
    }
    next();
  };
}

module.exports = requirePermission;
