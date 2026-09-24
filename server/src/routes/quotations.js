const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/quotationMongoController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

// Allow either quotations.* or fallback to invoices.* permissions
const canView = requirePermission(['quotations.view', 'invoices.view']);
const canCreate = requirePermission(['quotations.create', 'invoices.create']);
const canEdit = requirePermission(['quotations.edit', 'invoices.edit']);
const canDelete = requirePermission(['quotations.delete', 'invoices.delete']);
const canPrint = requirePermission(['quotations.print', 'invoices.print', 'quotations.view', 'invoices.view']);

router.get('/next-number', canView, asyncHandler(ctrl.nextNumber));
router.get('/', canView, asyncHandler(ctrl.list));
router.post('/', canCreate, asyncHandler(ctrl.create));
router.get('/:id', canView, asyncHandler(ctrl.getOne));
router.put('/:id', canEdit, asyncHandler(ctrl.update));
router.delete('/:id', canDelete, asyncHandler(ctrl.remove));
router.get('/:id/pdf', canPrint, asyncHandler(ctrl.getPdf));
router.get('/:id/print', canPrint, asyncHandler(ctrl.getPdf));

module.exports = router;
