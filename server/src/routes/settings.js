const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/settingsController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

// Any signed-in user may read the letterhead - invoice screens need the currency.
// Editing it stays restricted to settings.manage.
router.get('/', asyncHandler(ctrl.getSettings));
router.put('/', requirePermission('settings.manage'), asyncHandler(ctrl.updateSettings));

module.exports = router;
