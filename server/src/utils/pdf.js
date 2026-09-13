const path = require('path');
const PdfPrinter = require('pdfmake');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');

const fonts = {
  Roboto: {
    normal: path.join(FONT_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Roboto-Medium.ttf'),
    italics: path.join(FONT_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'Roboto-MediumItalic.ttf'),
  },
};

const printer = new PdfPrinter(fonts);

const PURPLE = '#5b2a86';
const INK = '#1f2430';
const MUTED = '#6b7280';
const RULE = '#e3e5ec';

function money(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(d) {
  // DATE columns arrive as plain "YYYY-MM-DD" strings (see dateStrings in db.js) -
  // slice instead of routing through Date/local-timezone math, which can shift the day.
  if (typeof d === 'string') return d.slice(0, 10);
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildPdf(docDefinition) {
  // A caller-supplied `defaultStyle` must merge on top of these base defaults, not
  // replace them wholesale - a naive spread drops `font`, and pdfmake then falls
  // back to a font name that isn't registered in the fonts table above.
  const { defaultStyle, ...rest } = docDefinition;

  return new Promise((resolve, reject) => {
    try {
      const doc = printer.createPdfKitDocument({
        pageSize: 'A4',
        pageMargins: [48, 44, 48, 56],
        ...rest,
        defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK, ...defaultStyle },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// The brand mark from the reference invoice: a purple rounded tile with a white
// tick, set beside the two-line "Permit Declaration" wordmark. Drawn with canvas
// primitives so it needs no image assets or SVG plugin.
function logoBlock() {
  return {
    columns: [
      {
        width: 34,
        canvas: [
          { type: 'rect', x: 0, y: 2, w: 30, h: 30, r: 7, color: PURPLE },
          {
            type: 'polyline',
            lineWidth: 3.6,
            lineColor: '#ffffff',
            lineCap: 'round',
            lineJoin: 'round',
            points: [{ x: 8, y: 17 }, { x: 13, y: 23 }, { x: 22.5, y: 10.5 }],
          },
        ],
      },
      {
        width: '*',
        stack: [
          { text: 'Permit', style: 'wordmark' },
          { text: 'Declaration', style: 'wordmark', margin: [0, -3, 0, 0] },
        ],
      },
    ],
    columnGap: 4,
    width: 160,
  };
}

// "PAYNOW" lockup from the reference: purple wordmark with a ring-and-dot glyph
// standing in for the O.
function payNowBadge() {
  return {
    columns: [
      { width: 'auto', text: 'PAYN', style: 'payNow' },
      {
        width: 15,
        canvas: [
          { type: 'ellipse', x: 7, y: 6.5, r1: 6.2, r2: 6.2, lineWidth: 2, lineColor: PURPLE },
          { type: 'ellipse', x: 7, y: 6.5, r1: 2.2, r2: 2.2, color: PURPLE },
        ],
        margin: [1, 2.5, 1, 0],
      },
      { width: 'auto', text: 'W', style: 'payNow' },
    ],
    columnGap: 0,
    margin: [0, 6, 0, 3],
  };
}

function invoicePdfDefinition(invoice, items, settings) {
  const currency = settings.default_currency || 'SGD';

  const itemRows = items.map((item, idx) => [
    { text: String(idx + 1), style: 'cell', alignment: 'left' },
    { text: item.productname, style: 'cell' },
    { text: item.description || '', style: 'cell' },
    { text: String(Number(item.rate)), style: 'cell' },
    { text: String(Number(item.quantity)), style: 'cell' },
    { text: money(item.total), style: 'cell', alignment: 'right' },
  ]);

  const fromLines = [
    { text: settings.company_name || '', style: 'partyName' },
    { text: settings.address || '', style: 'partyLine' },
  ];
  const telLine = [
    settings.tel ? `Tel: ${settings.tel}` : null,
    settings.mobile ? `HP: ${settings.mobile}` : null,
  ].filter(Boolean).join(' | ');
  if (telLine) fromLines.push({ text: telLine, style: 'partyLine' });
  if (settings.email) fromLines.push({ text: `Email: ${settings.email}`, style: 'partyLine' });
  if (settings.website) fromLines.push({ text: settings.website, style: 'partyLine' });
  if (settings.contact_no) fromLines.push({ text: `Contact: ${settings.contact_no}`, style: 'partyLine' });

  return {
    content: [
      // ---- Header: brand mark left, date + invoice number right ----
      {
        columns: [
          logoBlock(),
          {
            width: '*',
            stack: [
              { text: `Date: ${formatDate(invoice.invoice_date)}`, style: 'dateLine' },
              { text: `Invoice #${invoice.invoice_no}`, style: 'invoiceNo' },
            ],
            alignment: 'right',
          },
        ],
        margin: [0, 0, 0, 34],
      },

      // ---- Parties ----
      {
        columns: [
          { width: '8%', text: '' },
          {
            width: '44%',
            stack: [{ text: 'From:', style: 'partyLabel' }, ...fromLines],
          },
          {
            width: '48%',
            stack: [
              { text: `To: ${invoice.companyname}`, style: 'partyLabel' },
              { text: `Name: ${invoice.person_incharge || ''}`, style: 'partyName', margin: [0, 9, 0, 0] },
              { text: `Address: ${invoice.customer_address || ''}`, style: 'partyLine' },
              { text: `Phone: ${invoice.customer_mobile || invoice.customer_contact || ''}`, style: 'partyLine' },
            ],
          },
        ],
        margin: [0, 0, 0, 40],
      },

      // ---- Line items ----
      {
        table: {
          headerRows: 1,
          widths: [16, '*', 78, 62, 30, 52],
          body: [
            [
              { text: '#', style: 'th' },
              { text: 'product name', style: 'th' },
              { text: 'Description', style: 'th' },
              { text: `Unit Cost ${currency}`, style: 'th' },
              { text: 'Qty', style: 'th' },
              { text: `Total ${currency}`, style: 'th', alignment: 'right' },
            ],
            ...itemRows,
          ],
        },
        layout: {
          hLineWidth: () => 0.7,
          vLineWidth: () => 0,
          hLineColor: () => RULE,
          paddingTop: () => 9,
          paddingBottom: () => 9,
          paddingLeft: () => 0,
          paddingRight: (i) => (i === 5 ? 0 : 8),
        },
      },

      // ---- Payment details + total ----
      {
        columns: [
          {
            width: '55%',
            stack: [
              { text: 'All Cheques should be crossed and made payable to', style: 'payLead' },
              { text: (settings.company_name || '').toUpperCase(), style: 'payee' },
              payNowBadge(),
              { text: `UEN: ${settings.uen || ''}`, style: 'uen' },
            ],
          },
          {
            width: '45%',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 232, y2: 0, lineWidth: 0.7, lineColor: RULE }] },
              {
                columns: [
                  { text: 'Total', style: 'totalLabel' },
                  { text: money(invoice.sub_amount), style: 'totalValue', alignment: 'right' },
                ],
                margin: [0, 12, 0, 0],
              },
            ],
            margin: [0, 34, 0, 0],
          },
        ],
        margin: [0, 78, 0, 0],
      },
    ],

    styles: {
      wordmark: { fontSize: 15.5, bold: true, color: PURPLE, lineHeight: 1 },
      dateLine: { fontSize: 12, color: INK, margin: [0, 2, 0, 4] },
      invoiceNo: { fontSize: 17, bold: true, color: INK },
      partyLabel: { fontSize: 9.5, bold: true, color: INK },
      partyName: { fontSize: 11.5, bold: true, color: INK, margin: [0, 9, 0, 3], lineHeight: 1.25 },
      partyLine: { fontSize: 9.5, color: INK, lineHeight: 1.35 },
      th: { fontSize: 9.5, color: MUTED },
      cell: { fontSize: 9.5, color: INK, lineHeight: 1.2 },
      payLead: { fontSize: 9.5, color: INK },
      payee: { fontSize: 12.5, bold: true, color: INK, margin: [0, 3, 0, 0] },
      payNow: { fontSize: 14.5, bold: true, color: PURPLE },
      uen: { fontSize: 11.5, bold: true, color: INK },
      totalLabel: { fontSize: 10.5, color: INK },
      totalValue: { fontSize: 10.5, color: INK },
    },
  };
}

function reportPdfDefinition(rows, filters, summary) {
  const activeFilters = Object.entries({
    Company: filters.company,
    From: filters.start,
    To: filters.end,
    'Payment Status': filters.paymentStatus,
    Status: filters.status,
    'Invoice No': filters.invoiceNo,
  }).filter(([, v]) => v && v !== 'All').map(([k, v]) => `${k}: ${v}`).join('   •   ');

  const body = [
    ['Invoice No', 'Date', 'Company', 'Contact', 'Sub Amount', 'Paid', 'Due', 'Payment Status', 'Status'].map((h, i) => ({
      text: h, style: 'th', alignment: i >= 4 && i <= 6 ? 'right' : 'left',
    })),
    ...rows.map((r) => [
      { text: r.invoice_no, style: 'cell' },
      { text: formatDate(r.invoice_date), style: 'cell' },
      { text: r.companyname, style: 'cell' },
      { text: r.customer_contact || '', style: 'cell' },
      { text: money(r.sub_amount), style: 'cell', alignment: 'right' },
      { text: money(r.paid_amount), style: 'cell', alignment: 'right' },
      { text: money(r.due_amount), style: 'cell', alignment: 'right' },
      { text: r.payment_status || '', style: 'cell' },
      { text: r.status || '', style: 'cell' },
    ]),
  ];

  return {
    pageOrientation: 'landscape',
    content: [
      {
        columns: [
          logoBlock(),
          {
            width: '*',
            stack: [
              { text: 'Invoice Report', style: 'title' },
              { text: `Generated ${formatDate(new Date())}`, style: 'subtle' },
            ],
            alignment: 'right',
          },
        ],
        margin: [0, 0, 0, 14],
      },
      activeFilters
        ? { text: activeFilters, style: 'subtle', margin: [0, 0, 0, 12] }
        : { text: 'All invoices (no filters applied)', style: 'subtle', margin: [0, 0, 0, 12] },
      {
        table: { headerRows: 1, widths: [50, 58, '*', 74, 60, 55, 55, 72, 52], body },
        layout: {
          hLineWidth: () => 0.7,
          vLineWidth: () => 0,
          hLineColor: () => RULE,
          paddingTop: () => 7,
          paddingBottom: () => 7,
          paddingLeft: () => 0,
          paddingRight: () => 8,
        },
      },
      {
        columns: [
          { text: `${rows.length} invoice${rows.length === 1 ? '' : 's'}`, style: 'summary' },
          { text: `Total Amount: ${money(summary.totalAmount)}`, style: 'summary', alignment: 'right' },
          { text: `Total Due: ${money(summary.totalDue)}`, style: 'summary', alignment: 'right' },
        ],
        margin: [0, 16, 0, 0],
      },
    ],
    styles: {
      wordmark: { fontSize: 13, bold: true, color: PURPLE, lineHeight: 1 },
      title: { fontSize: 16, bold: true, color: INK },
      subtle: { fontSize: 8.5, color: MUTED },
      th: { fontSize: 8.5, color: MUTED },
      cell: { fontSize: 8.5, color: INK },
      summary: { fontSize: 9.5, bold: true, color: INK },
      payNow: { fontSize: 12, bold: true, color: PURPLE },
    },
    defaultStyle: { fontSize: 8.5 },
  };
}

module.exports = {
  buildPdf,
  invoicePdfDefinition,
  reportPdfDefinition,
  formatDate,
  money,
};
