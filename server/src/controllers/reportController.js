const { query, queryOne, likeTerm } = require('../utils/db');
const { buildPdf, reportPdfDefinition } = require('../utils/pdf');
const { buildReportExcel } = require('../utils/excel');
const { buildReportCsv } = require('../utils/csv');

const PREVIEW_LIMIT = 500;
const EXPORT_LIMIT = 10000;

function buildWhere(filters) {
  const { company, start, end, paymentStatus, status, invoiceNo } = filters;
  const conditions = ['i.is_deleted = 0'];
  const params = [];

  if (start) { conditions.push('i.invoice_date >= ?'); params.push(String(start).slice(0, 10)); }
  if (end) { conditions.push('i.invoice_date <= ?'); params.push(String(end).slice(0, 10)); }
  if (paymentStatus && paymentStatus !== 'All') { conditions.push('i.payment_status = ?'); params.push(paymentStatus); }
  if (status && status !== 'All') {
    if (status === 'Unpaid' || status === 'Pending') {
      conditions.push("i.status IN ('Pending', 'Unpaid')");
    } else {
      conditions.push('i.status = ?');
      params.push(status);
    }
  }
  if (invoiceNo && String(invoiceNo).trim() && invoiceNo !== 'All') { conditions.push('i.invoice_no = ?'); params.push(String(invoiceNo).trim()); }
  if (company && String(company).trim() && company !== 'All') { conditions.push('c.companyname LIKE ?'); params.push(likeTerm(String(company).trim())); }

  return { where: conditions.join(' AND '), params };
}

async function runQuery(filters, limit) {
  const { where, params } = buildWhere(filters);
  const from = 'FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id';

  const [totals, rows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS count, COALESCE(SUM(i.sub_amount), 0) AS totalAmount, COALESCE(SUM(i.due_amount), 0) AS totalDue ${from} WHERE ${where}`, params),
    query(
      `SELECT i.id, i.invoice_no, i.invoice_date, i.customer_id, i.customer_contact, i.sub_amount, i.paid_amount, i.due_amount,
              i.payment_type, i.payment_status, i.status, i.is_gst_bill, c.companyname
         ${from} WHERE ${where}
        ORDER BY i.invoice_date DESC, i.id DESC
        LIMIT ?`,
      [...params, limit]
    ),
  ]);

  const mappedRows = rows.map((r) => ({
    ...r,
    status: (r.status && String(r.status).toLowerCase() === 'pending') ? 'Unpaid' : (r.status || 'Unpaid'),
  }));
  const count = Number(totals?.count || 0);
  return {
    rows: mappedRows,
    summary: { totalAmount: Number(totals?.totalAmount || 0), totalDue: Number(totals?.totalDue || 0) },
    count,
    truncated: count > mappedRows.length,
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
  // Excel and CSV carry a letterhead (logo / company name and the filters used).
  const exportContext = async () => ({
    filters,
    settings: (await queryOne('SELECT * FROM company_settings ORDER BY id LIMIT 1')) || {},
  });
  if (format === 'pdf') {
    const buffer = await buildPdf(reportPdfDefinition(rows, filters, summary));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-report-${suffix}.pdf"`);
    return res.send(buffer);
  }
  if (format === 'xlsx') {
    const buffer = await buildReportExcel(rows, summary, await exportContext());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-report-${suffix}.xlsx"`);
    return res.send(buffer);
  }
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-report-${suffix}.csv"`);
    return res.send(buildReportCsv(rows, await exportContext()));
  }
  return res.status(400).json({ message: 'Invalid format. Use pdf, xlsx, or csv.' });
}

module.exports = { generate };
