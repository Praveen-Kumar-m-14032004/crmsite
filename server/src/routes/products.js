const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/productController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('products.view'), asyncHandler(ctrl.list));
router.post('/', requirePermission('products.create'), asyncHandler(ctrl.create));
router.get('/:id', requirePermission('products.view'), asyncHandler(ctrl.getOne));
router.put('/:id', requirePermission('products.edit'), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('products.delete'), asyncHandler(ctrl.remove));

module.exports = router;
