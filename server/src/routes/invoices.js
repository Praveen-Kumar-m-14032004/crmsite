const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/invoiceMongoController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

router.get('/next-number', requirePermission('invoices.view'), asyncHandler(ctrl.nextNumber));
router.get('/', requirePermission('invoices.view'), asyncHandler(ctrl.list));
router.post('/', requirePermission('invoices.create'), asyncHandler(ctrl.create));
router.get('/:id', requirePermission('invoices.view'), asyncHandler(ctrl.getOne));
router.put('/:id', requirePermission('invoices.edit'), asyncHandler(ctrl.update));
router.patch('/:id/status', requirePermission('invoices.edit'), asyncHandler(ctrl.patchStatus));
router.delete('/:id', requirePermission('invoices.delete'), asyncHandler(ctrl.remove));
router.get('/:id/print', requirePermission('invoices.print'), asyncHandler(ctrl.print));

module.exports = router;
