const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/dashboardController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get('/summary', requirePermission('dashboard.view'), asyncHandler(ctrl.summary));

module.exports = router;
