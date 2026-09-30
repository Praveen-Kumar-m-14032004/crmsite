const express = require('express');
const authenticate = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const ctrl = require('../controllers/invoiceMongoController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

// Each action is allowed for the full invoices permission or its GST-only twin.
// When only the GST-only permission is held, the controller confines the request
// to invoices whose every line is the GST product (see utils/authz and utils/gst).
const can = (action) => requirePermission([`invoices.${action}`, `gst_invoices.${action}`]);

router.get('/next-number', can('view'), asyncHandler(ctrl.nextNumber));
router.get('/', can('view'), asyncHandler(ctrl.list));
router.post('/', can('create'), asyncHandler(ctrl.create));
router.get('/:id', can('view'), asyncHandler(ctrl.getOne));
router.put('/:id', can('edit'), asyncHandler(ctrl.update));
router.patch('/:id/status', can('edit'), asyncHandler(ctrl.patchStatus));
router.post('/:id/restore', can('delete'), asyncHandler(ctrl.restore));
router.delete('/:id/permanent', can('delete'), asyncHandler(ctrl.permanentDelete));
router.delete('/:id', can('delete'), asyncHandler(ctrl.remove));
router.get('/:id/print', can('print'), asyncHandler(ctrl.print));
router.get('/:id/email-preview', can('print'), asyncHandler(ctrl.emailPreview));
router.post('/:id/email', can('print'), asyncHandler(ctrl.emailInvoice));

module.exports = router;
