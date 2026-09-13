const ExcelJS = require('exceljs');

async function buildReportExcel(rows, summary) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Invoice Report');

  sheet.columns = [
    { header: 'Invoice No', key: 'invoice_no', width: 15 },
    { header: 'Invoice Date', key: 'invoice_date', width: 15 },
    { header: 'Company', key: 'companyname', width: 30 },
    { header: 'Contact', key: 'customer_contact', width: 18 },
    { header: 'Sub Amount', key: 'sub_amount', width: 14 },
    { header: 'Paid', key: 'paid_amount', width: 14 },
    { header: 'Due', key: 'due_amount', width: 14 },
    { header: 'Payment Status', key: 'payment_status', width: 18 },
    { header: 'Status', key: 'status', width: 14 },
  ];

  sheet.getRow(1).font = { bold: true };

  rows.forEach((r) => {
    sheet.addRow({
      invoice_no: r.invoice_no,
      invoice_date: String(r.invoice_date).slice(0, 10),
      companyname: r.companyname,
      customer_contact: r.customer_contact,
      sub_amount: Number(r.sub_amount),
      paid_amount: Number(r.paid_amount),
      due_amount: Number(r.due_amount),
      payment_status: r.payment_status,
      status: r.status,
    });
  });

  sheet.addRow({});
  const totalRow = sheet.addRow({ invoice_no: 'Totals', sub_amount: summary.totalAmount, due_amount: summary.totalDue });
  totalRow.font = { bold: true };

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildReportExcel };
