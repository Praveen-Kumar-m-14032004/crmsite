const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/roleController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

// The user screens need the role list for their dropdowns, so reading roles is
// open to anyone who manages users. Changing roles stays behind roles.manage.
router.get('/', requirePermission(['roles.manage', 'users.manage']), asyncHandler(ctrl.list));
router.post('/', requirePermission('roles.manage'), asyncHandler(ctrl.create));
router.put('/:id', requirePermission('roles.manage'), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('roles.manage'), asyncHandler(ctrl.remove));

module.exports = router;
