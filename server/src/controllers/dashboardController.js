const pool = require('../config/db');
const { cached } = require('../utils/cache');

// The counts and sums scan the whole invoices table. Every user landing on the
// dashboard triggering that is what pushed p50 past a second under load; it is
// cleared the moment an invoice changes, so the numbers still update immediately.
const TTL_MS = 20000;

async function summary(_req, res) {
  // The four invoice metrics used to be four separate full scans of the same table.
  // One pass computes all of them; the remaining queries are independent so they
  // run concurrently rather than one awaited round trip after another.
  const [
    [[customers]], [[products]], [[invoiceStats]], [recent], [breakdown], [[settings]],
  ] = await cached("dashboard:summary", TTL_MS, () => Promise.all([
    pool.query('SELECT COUNT(*) AS total FROM customers'),
    pool.query('SELECT COUNT(*) AS total FROM products'),
    pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(is_gst_bill = 1), 0) AS gstBills,
              COALESCE(SUM(paid_amount), 0) AS revenue,
              COALESCE(SUM(due_amount), 0) AS outstanding
       FROM invoices`
    ),
    pool.query(
      `SELECT i.id, i.invoice_no, i.invoice_date, i.sub_amount, i.due_amount,
              i.payment_status, i.status, c.companyname
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       ORDER BY i.invoice_date DESC, i.id DESC
       LIMIT 6`
    ),
    pool.query(
      `SELECT COALESCE(payment_status, 'Unspecified') AS payment_status, COUNT(*) AS count
       FROM invoices GROUP BY payment_status`
    ),
    pool.query('SELECT default_currency FROM company_settings LIMIT 1'),
  ]));

  const invoices = { total: invoiceStats.total };
  const gstBills = { total: invoiceStats.gstBills };
  const revenue = { total: invoiceStats.revenue };
  const outstanding = { total: invoiceStats.outstanding };

  res.json({
    totalClients: customers.total,
    totalProducts: products.total,
    totalInvoices: invoices.total,
    totalGstBills: gstBills.total,
    totalRevenue: Number(revenue.total).toFixed(2),
    totalOutstanding: Number(outstanding.total).toFixed(2),
    currency: settings?.default_currency || 'SGD',
    recentInvoices: recent,
    paymentBreakdown: breakdown,
  });
}

module.exports = { summary };
