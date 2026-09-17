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

function buildReportCsv(rows) {
  const headers = [
    'Invoice No', 'Invoice Date', 'Company', 'Sub Amount', 'Status',
  ];

  const lines = [headers.join(',')];

  rows.forEach((r) => {
    lines.push([
      csvEscape(r.invoice_no),
      csvEscape(String(r.invoice_date).slice(0, 10)),
      csvEscape(r.companyname),
      csvEscape(Number(r.sub_amount).toFixed(2)),
      csvEscape(r.status),
    ].join(','));
  });

  return lines.join('\n');
}

module.exports = { buildReportCsv };
