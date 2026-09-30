const { collection, numericId } = require('./mongo');

/**
 * GST classification shared by invoices, products and the dashboard.
 *
 * Two flags are stored on every invoice:
 *   is_gst_bill  - at least one line is the GST product (drives "Total GST Bills")
 *   is_gst_only  - EVERY line is the GST product. This is the scope of GST-only
 *                  accounts such as Supervisor: they never see, print, edit,
 *                  delete or restore an invoice that carries any other product.
 */

const GST_NAME_REGEX = /^\s*gst\s*$/i;
const isGstName = (name) => GST_NAME_REGEX.test(String(name ?? ''));

// Mongo filter for invoices inside the GST-only scope.
const GST_ONLY_FILTER = { is_gst_only: 1 };
// Mongo filter for the product(s) a GST-only account may bill.
const GST_PRODUCT_FILTER = { productname: GST_NAME_REGEX };

function isGstOnlyInvoice(doc) {
  return doc?.is_gst_only === 1;
}

async function gstProductIds() {
  const rows = await collection('products').find(GST_PRODUCT_FILTER, { projection: { id: 1 } }).toArray();
  return new Set(rows.map((row) => row.id));
}

/**
 * Classify submitted line items. A line may reference the product by id or,
 * when it was typed in, by name.
 */
async function classifyItems(items = []) {
  if (!Array.isArray(items) || !items.length) return { gstBill: false, gstOnly: false };
  const ids = await gstProductIds();
  const flags = items.map((item) => {
    const id = numericId(item.product_id);
    return id ? ids.has(id) : isGstName(item.product_id);
  });
  return { gstBill: flags.some(Boolean), gstOnly: flags.every(Boolean) };
}

/**
 * Set is_gst_only on invoices written before the flag existed. Idempotent and
 * cheap once done: it only touches invoices that do not have the field yet.
 */
async function backfillGstOnly() {
  const pending = await collection('invoices')
    .find({ is_gst_only: { $exists: false } }, { projection: { id: 1 } })
    .toArray();
  if (!pending.length) return 0;

  const ids = await gstProductIds();
  const invoiceIds = pending.map((invoice) => invoice.id);
  const items = await collection('invoice_items')
    .find({ invoice_id: { $in: invoiceIds } }, { projection: { invoice_id: 1, product_id: 1 } })
    .toArray();

  const linesByInvoice = new Map();
  for (const item of items) {
    if (!linesByInvoice.has(item.invoice_id)) linesByInvoice.set(item.invoice_id, []);
    linesByInvoice.get(item.invoice_id).push(ids.has(item.product_id));
  }

  await collection('invoices').bulkWrite(invoiceIds.map((id) => {
    const flags = linesByInvoice.get(id) || [];
    return {
      updateOne: {
        filter: { id },
        update: {
          $set: {
            is_gst_bill: flags.some(Boolean) ? 1 : 0,
            is_gst_only: flags.length > 0 && flags.every(Boolean) ? 1 : 0,
          },
        },
      },
    };
  }));
  return invoiceIds.length;
}

module.exports = {
  GST_ONLY_FILTER,
  GST_PRODUCT_FILTER,
  isGstName,
  isGstOnlyInvoice,
  classifyItems,
  backfillGstOnly,
};
