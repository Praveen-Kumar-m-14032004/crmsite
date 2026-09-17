const ExcelJS = require('exceljs');

async function buildReportExcel(rows, summary) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Permit Declaration CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Invoice Report', {
    views: [{ showGridLines: true }],
  });

  // Title Block
  const titleRow = sheet.addRow(['Invoice Report']);
  titleRow.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FF6D2475' } };
  titleRow.height = 28;

  const dateStr = new Date().toISOString().slice(0, 10);
  const subRow = sheet.addRow([`Generated on ${dateStr} • ${rows.length} invoice${rows.length === 1 ? '' : 's'}`]);
  subRow.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: 'FF717684' } };
  subRow.height = 18;

  sheet.addRow([]); // Blank spacer

  // Table Headers
  const headers = ['Invoice No', 'Invoice Date', 'Company Name', 'Sub Amount', 'Status'];
  const headerRow = sheet.addRow(headers);
  headerRow.height = 25;

  headerRow.eachCell((cell, colNum) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF6D2475' },
    };
    cell.font = {
      name: 'Arial',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNum === 4 ? 'right' : colNum === 5 ? 'center' : 'left',
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF6D2475' } },
      bottom: { style: 'thin', color: { argb: 'FF6D2475' } },
      left: { style: 'thin', color: { argb: 'FF8E3E96' } },
      right: { style: 'thin', color: { argb: 'FF8E3E96' } },
    };
  });

  // Data Rows
  rows.forEach((r, idx) => {
    const isEven = idx % 2 === 0;
    const row = sheet.addRow([
      r.invoice_no,
      String(r.invoice_date).slice(0, 10),
      r.companyname,
      Number(r.sub_amount) || 0,
      (!r.status || String(r.status).toLowerCase() === 'pending') ? 'Unpaid' : r.status,
    ]);
    row.height = 20;

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FF343A40' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8F9FA' },
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE9ECEF' } },
        left: { style: 'thin', color: { argb: 'FFE9ECEF' } },
        right: { style: 'thin', color: { argb: 'FFE9ECEF' } },
      };

      if (colNum === 4) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNum === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  // Totals Row
  const totalAmount = summary?.totalAmount !== undefined
    ? Number(summary.totalAmount)
    : rows.reduce((acc, r) => acc + (Number(r.sub_amount) || 0), 0);

  const totalRow = sheet.addRow(['Total Amount', '', '', totalAmount, '']);
  totalRow.height = 24;

  totalRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF343A40' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2E6F4' },
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF6D2475' } },
      bottom: { style: 'double', color: { argb: 'FF6D2475' } },
    };

    if (colNum === 4) {
      cell.numFmt = '#,##0.00';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  });

  // Column Widths
  sheet.columns = [
    { width: 20 },
    { width: 16 },
    { width: 36 },
    { width: 18 },
    { width: 16 },
  ];

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildReportExcel };
