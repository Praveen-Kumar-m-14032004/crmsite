const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/customerController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

// The invoice and quotation forms need the customer list for their company
// picker, so anyone who can create or edit those may read customers.
const canReadList = requirePermission([
  'customers.view',
  'invoices.create', 'invoices.edit',
  'gst_invoices.create', 'gst_invoices.edit',
  'quotations.create', 'quotations.edit',
]);

router.get('/', canReadList, asyncHandler(ctrl.list));
router.post('/', requirePermission('customers.create'), asyncHandler(ctrl.create));
router.get('/:id', requirePermission('customers.view'), asyncHandler(ctrl.getOne));
router.put('/:id', requirePermission('customers.edit'), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('customers.delete'), asyncHandler(ctrl.remove));

module.exports = router;
