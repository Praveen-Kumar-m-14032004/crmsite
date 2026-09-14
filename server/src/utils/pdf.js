const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
const PAYNOW_PATH = path.join(__dirname, '..', 'assets', 'paynow.png');

let logoBase64 = null;
let paynowBase64 = null;

try {
  if (fs.existsSync(LOGO_PATH)) {
    logoBase64 = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;
  }
  if (fs.existsSync(PAYNOW_PATH)) {
    paynowBase64 = `data:image/png;base64,${fs.readFileSync(PAYNOW_PATH).toString('base64')}`;
  }
} catch (err) {
  console.error('[pdf] Failed to read asset logos:', err.message);
}

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
  if (!d) return '—';
  if (typeof d === 'string') return d.slice(0, 10);
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildPdf(docDefinition) {
  const { defaultStyle, ...rest } = docDefinition;

  return new Promise((resolve, reject) => {
    try {
      const doc = printer.createPdfKitDocument({
        pageSize: 'A4',
        pageMargins: [48, 42, 48, 48],
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

function logoBlock() {
  if (logoBase64) {
    return {
      image: logoBase64,
      width: 175,
    };
  }
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

function payNowBadge() {
  if (paynowBase64) {
    return {
      image: paynowBase64,
      width: 140,
      margin: [0, 5, 0, 4],
    };
  }
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
  const uenNumber = settings.uen || '201835067C';
  const manyItems = items.length >= 8;

  const itemRows = items.map((item, idx) => [
    { text: String(idx + 1), style: 'cell', alignment: 'left' },
    { text: item.productname || '', style: 'cell' },
    { text: item.description || '', style: 'cell' },
    { text: String(Number(item.rate)), style: 'cell' },
    { text: String(Number(item.quantity)), style: 'cell' },
    { text: money(item.total), style: 'cell', alignment: 'right' },
  ]);

  const fromLines = [
    { text: settings.company_name || 'Chola Logistics Pte Ltd', style: 'partyName' },
    { text: settings.address || '', style: 'partyLine' },
  ];
  if (uenNumber) fromLines.push({ text: `UEN: ${uenNumber}`, style: 'partyLine' });
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
      // ---- Header: Logo left, Date + Invoice # right ----
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
        margin: [0, 0, 0, manyItems ? 16 : 28],
      },

      // ---- From & To Section ----
      {
        columns: [
          { width: '6%', text: '' },
          {
            width: '45%',
            stack: [
              { text: 'From:', style: 'partyLabel' },
              ...fromLines,
            ],
          },
          {
            width: '49%',
            stack: [
              { text: `To: ${invoice.companyname || ''}`, style: 'partyLabelBold' },
              { text: `Name: ${invoice.person_incharge || ''}`, style: 'partyName', margin: [0, 8, 0, 0] },
              { text: `Address: ${invoice.customer_address || ''}`, style: 'partyLine' },
              { text: `Phone: ${invoice.customer_mobile || invoice.customer_contact || ''}`, style: 'partyLine' },
            ],
          },
        ],
        margin: [0, 0, 0, manyItems ? 18 : 32],
      },

      // ---- Line items table ----
      {
        table: {
          headerRows: 1,
          widths: [18, '*', 95, 68, 32, 58],
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
          paddingTop: () => (manyItems ? 4.5 : 8),
          paddingBottom: () => (manyItems ? 4.5 : 8),
          paddingLeft: () => 0,
          paddingRight: (i) => (i === 5 ? 0 : 8),
        },
      },

      // ---- Payment details + Total ----
      {
        columns: [
          {
            width: '56%',
            stack: [
              { text: 'All Cheques should be crossed and made payable to', style: 'payLead' },
              { text: (settings.company_name || '').toUpperCase(), style: 'payee' },
              payNowBadge(),
              { text: `UEN: ${uenNumber}`, style: 'uen' },
            ],
          },
          {
            width: '44%',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 228, y2: 0, lineWidth: 0.8, lineColor: '#1a1e28' }] },
              {
                columns: [
                  { text: 'Total', style: 'totalLabel' },
                  { text: money(invoice.sub_amount), style: 'totalValue', alignment: 'right' },
                ],
                margin: [0, 10, 0, 0],
              },
            ],
            margin: [0, 28, 0, 0],
          },
        ],
        margin: [0, manyItems ? 22 : 60, 0, 0],
      },
    ],

    styles: {
      wordmark: { fontSize: 15.5, bold: true, color: PURPLE, lineHeight: 1 },
      dateLine: { fontSize: 11.5, color: INK, margin: [0, 2, 0, 3] },
      invoiceNo: { fontSize: 16.5, bold: true, color: INK },

      partyLabel: { fontSize: 9.5, color: INK },
      partyLabelBold: { fontSize: 9.5, bold: true, color: INK },
      partyName: { fontSize: 11, bold: true, color: INK, margin: [0, 8, 0, 2], lineHeight: 1.25 },
      partyLine: { fontSize: 9, color: INK, lineHeight: 1.35 },

      th: { fontSize: 9, color: MUTED },
      cell: { fontSize: 9, color: INK, lineHeight: 1.25 },

      payLead: { fontSize: 9, color: INK },
      payee: { fontSize: 12, bold: true, color: INK, margin: [0, 3, 0, 0] },
      payNow: { fontSize: 14, bold: true, color: PURPLE },
      uen: { fontSize: 11, bold: true, color: INK },

      totalLabel: { fontSize: 10, color: INK },
      totalValue: { fontSize: 10.5, bold: true, color: INK },
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
