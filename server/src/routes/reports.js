const express = require('express');
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/reportController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

function requireReportAccess(req, res, next) {
  const permissions = req.user?.permissions || [];
  const needed = req.query.format ? 'reports.export' : 'reports.view';
  if (!permissions.includes(needed)) {
    return res.status(403).json({ message: `Missing permission: ${needed}` });
  }
  next();
}

router.get('/', requireReportAccess, asyncHandler(ctrl.generate));

module.exports = router;
