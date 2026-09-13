const pool = require('../config/db');
const { buildPdf, reportPdfDefinition } = require('../utils/pdf');
const { buildReportExcel } = require('../utils/excel');
const { buildReportCsv } = require('../utils/csv');

// On-screen preview stays small - the UI renders every row into one table.
// Exports get a higher ceiling that still keeps PDF/Excel building bounded.
const PREVIEW_LIMIT = 500;
const EXPORT_LIMIT = 10000;

async function runQuery(filters, limit) {
  const {
    company, start, end, paymentStatus, status, invoiceNo,
  } = filters;

  const clauses = [];
  const params = [];

  if (company) {
    clauses.push('c.companyname LIKE ?');
    params.push(`%${company}%`);
  }
  if (start) {
    clauses.push('i.invoice_date >= ?');
    params.push(start);
  }
  if (end) {
    clauses.push('i.invoice_date <= ?');
    params.push(end);
  }
  if (paymentStatus && paymentStatus !== 'All') {
    clauses.push('i.payment_status = ?');
    params.push(paymentStatus);
  }
  if (status && status !== 'All') {
    clauses.push('i.status = ?');
    params.push(status);
  }
  if (invoiceNo) {
    clauses.push('i.invoice_no = ?');
    params.push(invoiceNo);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  // Totals come from SQL over every matching row, so they stay correct even when
  // the row list below is capped - a truncated report must never show a wrong total.
  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(i.sub_amount), 0) AS totalAmount,
            COALESCE(SUM(i.due_amount), 0) AS totalDue
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     ${where}`,
    params
  );

  // Without a cap an unfiltered report pulls every invoice into memory and the
  // PDF/Excel builders then multiply it - enough to exhaust the heap.
  const [rows] = await pool.query(
    `SELECT i.*, c.companyname
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     ${where}
     ORDER BY i.invoice_date DESC, i.id DESC
     LIMIT ?`,
    [...params, limit]
  );

  return {
    rows,
    summary: {
      totalAmount: Number(totals.totalAmount),
      totalDue: Number(totals.totalDue),
    },
    count: Number(totals.count),
    truncated: Number(totals.count) > rows.length,
  };
}

function filenameSuffix(filters) {
  const start = filters.start || 'all';
  const end = filters.end || 'all';
  return `${start}_to_${end}`;
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

  const { rows, summary, count, truncated } = await runQuery(
    filters,
    format ? EXPORT_LIMIT : PREVIEW_LIMIT
  );

  if (!format) {
    return res.json({ data: rows, summary, count, truncated, shown: rows.length });
  }

  const suffix = filenameSuffix(filters);

  if (format === 'pdf') {
    const pdfBuffer = await buildPdf(reportPdfDefinition(rows, filters, summary));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-report-${suffix}.pdf"`);
    return res.send(pdfBuffer);
  }

  if (format === 'xlsx') {
    const buffer = await buildReportExcel(rows, summary);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-report-${suffix}.xlsx"`);
    return res.send(buffer);
  }

  if (format === 'csv') {
    const csv = buildReportCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-report-${suffix}.csv"`);
    return res.send(csv);
  }

  return res.status(400).json({ message: 'Invalid format. Use pdf, xlsx, or csv.' });
}

module.exports = { generate };
