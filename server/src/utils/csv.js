const { reportHeader } = require('./reportMeta');

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);

  // Excel and Sheets execute a cell that starts with = + - @ as a formula, so a
  // customer named '=HYPERLINK("http://evil","click")' would become a live link in
  // the exported file. Prefix those with an apostrophe to force text. Plain numbers
  // are left alone so amount columns still add up in the spreadsheet.
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(str);
  const safe = !isPlainNumber && /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;

  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * A CSV file is plain text and cannot contain an image, so the company logo is
 * represented by a text letterhead above the table: company name, report title,
 * generated date with invoice count, and the filters used. A blank line separates
 * it from the column headers.
 *
 * @param {Array} rows
 * @param {{filters?: object, settings?: object}} context  filters used and company settings
 */
function buildReportCsv(rows, context = {}) {
  const header = reportHeader(rows, context);
  const headers = [
    'Invoice No', 'Invoice Date', 'Company Name', 'Sub Amount', 'Status',
  ];

  const lines = [
    csvEscape(header.company),
    csvEscape(header.title),
    csvEscape(`Generated on ${header.generatedOn} | ${header.countLabel}`),
    csvEscape(header.filtersLabel),
    '',
    headers.join(','),
  ];

  rows.forEach((r) => {
    lines.push([
      csvEscape(r.invoice_no),
      csvEscape(String(r.invoice_date).slice(0, 10)),
      csvEscape(r.companyname),
      csvEscape(Number(r.sub_amount).toFixed(2)),
      csvEscape((!r.status || String(r.status).toLowerCase() === 'pending') ? 'Unpaid' : r.status),
    ].join(','));
  });

  // Byte-order mark so Excel opens the file as UTF-8 (company names with accents etc.).
  return `﻿${lines.join('\r\n')}`;
}

module.exports = { buildReportCsv };
