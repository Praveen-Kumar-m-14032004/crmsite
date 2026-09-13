const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/customerController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('customers.view'), asyncHandler(ctrl.list));
router.post('/', requirePermission('customers.create'), asyncHandler(ctrl.create));
router.get('/:id', requirePermission('customers.view'), asyncHandler(ctrl.getOne));
router.put('/:id', requirePermission('customers.edit'), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('customers.delete'), asyncHandler(ctrl.remove));

module.exports = router;
