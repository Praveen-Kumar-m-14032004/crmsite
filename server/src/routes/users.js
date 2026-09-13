const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/userController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('users.manage'), asyncHandler(ctrl.list));
router.post('/', requirePermission('users.manage'), asyncHandler(ctrl.create));
router.put('/:id', requirePermission('users.manage'), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('users.manage'), asyncHandler(ctrl.remove));

module.exports = router;
