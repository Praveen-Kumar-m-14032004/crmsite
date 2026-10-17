const { query, queryOne } = require('../utils/db');
const { cached } = require('../utils/cache');
const { gstOnly } = require('../utils/authz');
const { GST_PRODUCT_WHERE } = require('../utils/gst');

const TTL_MS = 20000;

/**
 * Build the dashboard numbers. With `gstScoped` every invoice figure (counts,
 * revenue, recent list, payment breakdown) is limited to GST-only invoices, so a
 * GST-only account such as Supervisor never learns anything about other invoices.
 */
async function buildSummary(gstScoped) {
  const invoiceWhere = gstScoped ? 'i.is_deleted = 0 AND i.is_gst_only = 1' : 'i.is_deleted = 0';

  const [customers, products, stats, recent, breakdown, settings] = await Promise.all([
    queryOne('SELECT COUNT(*) AS n FROM customers'),
    queryOne(`SELECT COUNT(*) AS n FROM products ${gstScoped ? `WHERE ${GST_PRODUCT_WHERE}` : ''}`),
    queryOne(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(i.is_gst_bill), 0) AS gstBills,
              COALESCE(SUM(i.paid_amount), 0) AS revenue,
              COALESCE(SUM(i.due_amount), 0) AS outstanding
         FROM invoices i WHERE ${invoiceWhere}`
    ),
    query(
      `SELECT i.id, i.invoice_no, i.invoice_date, i.sub_amount, i.due_amount, i.payment_status, i.status, c.companyname
         FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
        WHERE ${invoiceWhere}
        ORDER BY i.invoice_date DESC, i.id DESC
        LIMIT 6`
    ),
    query(
      `SELECT COALESCE(i.payment_status, 'Unspecified') AS payment_status, COUNT(*) AS count
         FROM invoices i WHERE ${invoiceWhere}
        GROUP BY COALESCE(i.payment_status, 'Unspecified')`
    ),
    queryOne('SELECT default_currency FROM company_settings ORDER BY id LIMIT 1'),
  ]);

  return {
    scope: gstScoped ? 'gst' : 'all',
    totalClients: Number(customers?.n || 0),
    totalProducts: Number(products?.n || 0),
    totalInvoices: Number(stats?.total || 0),
    totalGstBills: Number(stats?.gstBills || 0),
    totalRevenue: Number(stats?.revenue || 0).toFixed(2),
    totalOutstanding: Number(stats?.outstanding || 0).toFixed(2),
    currency: settings?.default_currency || 'SGD',
    recentInvoices: recent,
    paymentBreakdown: breakdown.map((row) => ({ payment_status: row.payment_status, count: Number(row.count) })),
  };
}

async function summary(req, res) {
  const gstScoped = gstOnly(req, 'view');
  // Separate cache entries per scope; both are dropped by invalidate('dashboard:').
  const key = gstScoped ? 'dashboard:summary:gst' : 'dashboard:summary:all';
  res.json(await cached(key, TTL_MS, () => buildSummary(gstScoped)));
}

module.exports = { summary };
