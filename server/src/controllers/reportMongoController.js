const { collection } = require('../utils/mongo');
const { buildPdf, reportPdfDefinition } = require('../utils/pdf');
const { buildReportExcel } = require('../utils/excel');
const { buildReportCsv } = require('../utils/csv');

const PREVIEW_LIMIT = 500;
const EXPORT_LIMIT = 10000;

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runQuery(filters, limit) {
  const { company, start, end, paymentStatus, status, invoiceNo } = filters;
  const match = { is_deleted: { $ne: true } };

  if (start || end) match.invoice_date = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
  if (paymentStatus && paymentStatus !== 'All') match.payment_status = paymentStatus;
  if (status && status !== 'All') {
    if (status === 'Unpaid' || status === 'Pending') {
      match.status = { $in: ['Pending', 'Unpaid'] };
    } else {
      match.status = status;
    }
  }
  if (invoiceNo && String(invoiceNo).trim() && invoiceNo !== 'All') match.invoice_no = String(invoiceNo).trim();

  const pipeline = [
    { $match: match },
    { $lookup: { from: 'customers', localField: 'customer_id', foreignField: 'id', as: 'customer' } },
    { $unwind: '$customer' },
  ];

  if (company && String(company).trim() && company !== 'All') {
    pipeline.push({ $match: { 'customer.companyname': { $regex: escapeRegex(String(company).trim()), $options: 'i' } } });
  }

  const [result] = await collection('invoices').aggregate([
    ...pipeline,
    {
      $facet: {
        totals: [{ $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$sub_amount' }, totalDue: { $sum: '$due_amount' } } }],
        rows: [
          { $sort: { invoice_date: -1, id: -1 } },
          { $limit: limit },
          { $project: { id: 1, invoice_no: 1, invoice_date: 1, customer_id: 1, customer_contact: 1, sub_amount: 1, paid_amount: 1, due_amount: 1, payment_type: 1, payment_status: 1, status: 1, is_gst_bill: 1, companyname: '$customer.companyname' } },
        ],
      },
    },
  ]).toArray();

  const totals = result.totals[0] || { count: 0, totalAmount: 0, totalDue: 0 };
  const mappedRows = (result.rows || []).map((r) => ({
    ...r,
    status: (r.status && String(r.status).toLowerCase() === 'pending') ? 'Unpaid' : (r.status || 'Unpaid'),
  }));
  return {
    rows: mappedRows,
    summary: { totalAmount: Number(totals.totalAmount || 0), totalDue: Number(totals.totalDue || 0) },
    count: Number(totals.count || 0),
    truncated: Number(totals.count || 0) > mappedRows.length,
  };
}

function filenameSuffix(filters) {
  return `${filters.start || 'all'}_to_${filters.end || 'all'}`;
}

async function generate(req, res) {
  const filters = {
    company: req.query.company,
    start: req.query.start,
    end: req.query.end,
    paymentStatus: req.query.paymentStatus,
    status: req.query.status,
    invoiceNo: req.query.invoiceNo,
  };
  const format = req.query.format;
  const { rows, summary, count, truncated } = await runQuery(filters, format ? EXPORT_LIMIT : PREVIEW_LIMIT);

  if (!format) return res.json({ data: rows, summary, count, truncated, shown: rows.length });

  const suffix = filenameSuffix(filters);
  if (format === 'pdf') {
    const buffer = await buildPdf(reportPdfDefinition(rows, filters, summary));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-report-${suffix}.pdf"`);
    return res.send(buffer);
  }
  if (format === 'xlsx') {
    const buffer = await buildReportExcel(rows, summary);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-report-${suffix}.xlsx"`);
    return res.send(buffer);
  }
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-report-${suffix}.csv"`);
    return res.send(buildReportCsv(rows));
  }
  return res.status(400).json({ message: 'Invalid format. Use pdf, xlsx, or csv.' });
}

module.exports = { generate };
