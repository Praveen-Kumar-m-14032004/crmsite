const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { reportHeader } = require('./reportMeta');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
const PURPLE = 'FF6D2475';
const MUTED = 'FF717684';
const COLUMN_COUNT = 5;

/* ---- Read the logo once at module load, with its pixel size for scaling ---- */
let logo = null;
try {
  if (fs.existsSync(LOGO_PATH)) {
    const buffer = fs.readFileSync(LOGO_PATH);
    // PNG: width and height are big-endian uint32 at bytes 16 and 20 of the IHDR chunk.
    logo = { buffer, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
} catch (err) {
  console.error('[excel] Failed to read the logo:', err.message);
}

// The logo sits over columns A-B (about 260px wide); scale it to fit with a margin.
const LOGO_MAX_WIDTH = 215;
const LOGO_MAX_HEIGHT = 50;

function logoSize() {
  const scale = Math.min(LOGO_MAX_WIDTH / logo.width, LOGO_MAX_HEIGHT / logo.height, 1);
  return { width: Math.round(logo.width * scale), height: Math.round(logo.height * scale) };
}

/**
 * Letterhead: logo top-left, report title and generated line top-right, company
 * name under the logo and the applied filters under that. Mirrors the PDF export.
 * Returns nothing; the table starts on the row after the blank spacer.
 */
function addLetterhead(workbook, sheet, header) {
  // Row 1: logo (left) + title (right)
  const topRow = sheet.addRow([]);
  topRow.height = 46;
  sheet.mergeCells(1, 3, 1, COLUMN_COUNT);
  const titleCell = sheet.getCell(1, 3);
  titleCell.value = header.title;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: PURPLE } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'right' };

  if (logo) {
    const imageId = workbook.addImage({ buffer: logo.buffer, extension: 'png' });
    sheet.addImage(imageId, {
      tl: { col: 0.15, row: 0.18 },
      ext: logoSize(),
      editAs: 'oneCell',
    });
  }

  // Row 2: company name (left) + generated line (right)
  const infoRow = sheet.addRow([]);
  infoRow.height = 18;
  sheet.mergeCells(2, 1, 2, 2);
  const companyCell = sheet.getCell(2, 1);
  companyCell.value = header.company;
  companyCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF343A40' } };
  companyCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.mergeCells(2, 3, 2, COLUMN_COUNT);
  const generatedCell = sheet.getCell(2, 3);
  generatedCell.value = `Generated on ${header.generatedOn} • ${header.countLabel}`;
  generatedCell.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: MUTED } };
  generatedCell.alignment = { vertical: 'middle', horizontal: 'right' };

  // Row 3: filters the report was run with
  const filterRow = sheet.addRow([]);
  filterRow.height = 18;
  sheet.mergeCells(3, 1, 3, COLUMN_COUNT);
  const filterCell = sheet.getCell(3, 1);
  filterCell.value = header.filtersLabel;
  filterCell.font = { name: 'Arial', size: 9.5, color: { argb: MUTED } };
  filterCell.alignment = { vertical: 'middle', horizontal: 'left' };
  filterCell.border = { bottom: { style: 'thin', color: { argb: PURPLE } } };

  sheet.addRow([]); // Blank spacer
}

/**
 * @param {Array} rows      report rows
 * @param {object} summary  { totalAmount }
 * @param {{filters?: object, settings?: object}} context  filters used and company settings
 */
async function buildReportExcel(rows, summary, context = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Permit Declaration CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Invoice Report', {
    views: [{ showGridLines: true }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Column widths first: the logo is positioned relative to them.
  sheet.columns = [
    { width: 20 },
    { width: 16 },
    { width: 36 },
    { width: 18 },
    { width: 16 },
  ];

  addLetterhead(workbook, sheet, reportHeader(rows, context));

  // Table Headers
  const headers = ['Invoice No', 'Invoice Date', 'Company Name', 'Sub Amount', 'Status'];
  const headerRow = sheet.addRow(headers);
  headerRow.height = 25;

  headerRow.eachCell((cell, colNum) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: PURPLE },
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
      top: { style: 'thin', color: { argb: PURPLE } },
      bottom: { style: 'thin', color: { argb: PURPLE } },
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
      top: { style: 'medium', color: { argb: PURPLE } },
      bottom: { style: 'double', color: { argb: PURPLE } },
    };

    if (colNum === 4) {
      cell.numFmt = '#,##0.00';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildReportExcel };
