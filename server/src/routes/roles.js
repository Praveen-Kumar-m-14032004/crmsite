const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/roleController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('roles.manage'), asyncHandler(ctrl.list));
router.post('/', requirePermission('roles.manage'), asyncHandler(ctrl.create));
router.put('/:id', requirePermission('roles.manage'), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('roles.manage'), asyncHandler(ctrl.remove));

module.exports = router;
