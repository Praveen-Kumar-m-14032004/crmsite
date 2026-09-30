const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/productController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

// The invoice form needs the product list for its line items, so anyone who can
// create or edit invoices may read products even without the products module.
const canReadList = requirePermission([
  'products.view',
  'invoices.create', 'invoices.edit',
  'gst_invoices.create', 'gst_invoices.edit',
  'quotations.create', 'quotations.edit',
]);

router.get('/', canReadList, asyncHandler(ctrl.list));
router.post('/', requirePermission('products.create'), asyncHandler(ctrl.create));
router.get('/:id', requirePermission('products.view'), asyncHandler(ctrl.getOne));
router.put('/:id', requirePermission('products.edit'), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('products.delete'), asyncHandler(ctrl.remove));

module.exports = router;
