const { collection } = require('../utils/mongo');
const { cached } = require('../utils/cache');
const { gstOnly } = require('../utils/authz');
const { GST_ONLY_FILTER, GST_PRODUCT_FILTER } = require('../utils/gst');

const TTL_MS = 20000;

/**
 * Build the dashboard numbers. With `gstScoped` every invoice figure (counts,
 * revenue, recent list, payment breakdown) is limited to GST-only invoices, so a
 * GST-only account such as Supervisor never learns anything about other invoices.
 */
async function buildSummary(gstScoped) {
  const invoiceMatch = gstScoped
    ? { is_deleted: { $ne: true }, ...GST_ONLY_FILTER }
    : { is_deleted: { $ne: true } };

  const [customers, products, invoiceStats, recent, breakdown, settings] = await Promise.all([
    collection('customers').countDocuments(),
    collection('products').countDocuments(gstScoped ? GST_PRODUCT_FILTER : {}),
    collection('invoices').aggregate([
      { $match: invoiceMatch },
      { $group: { _id: null, total: { $sum: 1 }, gstBills: { $sum: '$is_gst_bill' }, revenue: { $sum: '$paid_amount' }, outstanding: { $sum: '$due_amount' } } },
    ]).toArray(),
    collection('invoices').aggregate([
      { $match: invoiceMatch },
      { $lookup: { from: 'customers', localField: 'customer_id', foreignField: 'id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $sort: { invoice_date: -1, id: -1 } },
      { $limit: 6 },
      { $project: { id: 1, invoice_no: 1, invoice_date: 1, sub_amount: 1, due_amount: 1, payment_status: 1, status: 1, companyname: '$customer.companyname' } },
    ]).toArray(),
    collection('invoices').aggregate([
      { $match: invoiceMatch },
      { $group: { _id: { $ifNull: ['$payment_status', 'Unspecified'] }, count: { $sum: 1 } } },
      { $project: { _id: 0, payment_status: '$_id', count: 1 } },
    ]).toArray(),
    collection('company_settings').findOne({}),
  ]);

  const stats = invoiceStats[0] || { total: 0, gstBills: 0, revenue: 0, outstanding: 0 };
  return {
    scope: gstScoped ? 'gst' : 'all',
    totalClients: customers,
    totalProducts: products,
    totalInvoices: stats.total,
    totalGstBills: stats.gstBills,
    totalRevenue: Number(stats.revenue).toFixed(2),
    totalOutstanding: Number(stats.outstanding).toFixed(2),
    currency: settings?.default_currency || 'SGD',
    recentInvoices: recent,
    paymentBreakdown: breakdown,
  };
}

async function summary(req, res) {
  const gstScoped = gstOnly(req, 'view');
  // Separate cache entries per scope; both are dropped by invalidate('dashboard:').
  const key = gstScoped ? 'dashboard:summary:gst' : 'dashboard:summary:all';
  res.json(await cached(key, TTL_MS, () => buildSummary(gstScoped)));
}

module.exports = { summary };
