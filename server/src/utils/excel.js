const ExcelJS = require('exceljs');

async function buildReportExcel(rows, summary) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Invoice Report');

  sheet.columns = [
    { header: 'Invoice No', key: 'invoice_no', width: 18 },
    { header: 'Invoice Date', key: 'invoice_date', width: 15 },
    { header: 'Company', key: 'companyname', width: 30 },
    { header: 'Sub Amount', key: 'sub_amount', width: 16 },
    { header: 'Status', key: 'status', width: 15 },
  ];

  sheet.getRow(1).font = { bold: true };

  rows.forEach((r) => {
    sheet.addRow({
      invoice_no: r.invoice_no,
      invoice_date: String(r.invoice_date).slice(0, 10),
      companyname: r.companyname,
      sub_amount: Number(r.sub_amount),
      status: r.status,
    });
  });

  sheet.addRow({});
  const totalRow = sheet.addRow({ invoice_no: 'Totals', sub_amount: summary.totalAmount });
  totalRow.font = { bold: true };

  sheet.getColumn('invoice_no').alignment = { horizontal: 'left' };
  sheet.getColumn('invoice_date').alignment = { horizontal: 'left' };
  sheet.getColumn('companyname').alignment = { horizontal: 'left' };
  sheet.getColumn('sub_amount').alignment = { horizontal: 'right' };
  sheet.getColumn('status').alignment = { horizontal: 'center' };

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildReportExcel };
