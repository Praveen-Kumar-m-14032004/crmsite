const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/quotationMongoController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

// Quotations have their own row in the permission matrix; invoice permissions no
// longer grant quotation access implicitly.
router.get('/next-number', requirePermission('quotations.view'), asyncHandler(ctrl.nextNumber));
router.get('/', requirePermission('quotations.view'), asyncHandler(ctrl.list));
router.post('/', requirePermission('quotations.create'), asyncHandler(ctrl.create));
router.get('/:id', requirePermission('quotations.view'), asyncHandler(ctrl.getOne));
router.put('/:id', requirePermission('quotations.edit'), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('quotations.delete'), asyncHandler(ctrl.remove));
router.get('/:id/pdf', requirePermission('quotations.print'), asyncHandler(ctrl.getPdf));
router.get('/:id/print', requirePermission('quotations.print'), asyncHandler(ctrl.getPdf));

module.exports = router;
