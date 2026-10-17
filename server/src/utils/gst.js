const { query, execute, numericId } = require('./db');

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

// SQL fragment selecting the product(s) a GST-only account may bill.
const GST_PRODUCT_WHERE = "UPPER(TRIM(productname)) = 'GST'";

function isGstOnlyInvoice(doc) {
  return Number(doc?.is_gst_only) === 1;
}

async function gstProductIds() {
  const rows = await query(`SELECT id FROM products WHERE ${GST_PRODUCT_WHERE}`);
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
 * Set is_gst_only on invoices that do not have it yet. Idempotent and cheap once
 * done: it only touches invoices whose flag is NULL.
 */
async function backfillGstOnly() {
  const pending = await query('SELECT id FROM invoices WHERE is_gst_only IS NULL');
  if (!pending.length) return 0;

  const ids = await gstProductIds();
  const invoiceIds = pending.map((row) => row.id);
  const items = await query('SELECT invoice_id, product_id FROM invoice_items WHERE invoice_id IN (?)', [invoiceIds]);

  const linesByInvoice = new Map();
  for (const item of items) {
    if (!linesByInvoice.has(item.invoice_id)) linesByInvoice.set(item.invoice_id, []);
    linesByInvoice.get(item.invoice_id).push(ids.has(item.product_id));
  }

  for (const id of invoiceIds) {
    const flags = linesByInvoice.get(id) || [];
    await execute('UPDATE invoices SET is_gst_bill = ?, is_gst_only = ? WHERE id = ?', [
      flags.some(Boolean) ? 1 : 0,
      flags.length > 0 && flags.every(Boolean) ? 1 : 0,
      id,
    ]);
  }
  return invoiceIds.length;
}

module.exports = {
  GST_PRODUCT_WHERE,
  isGstName,
  isGstOnlyInvoice,
  classifyItems,
  backfillGstOnly,
};
