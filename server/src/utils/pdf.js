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
  Lato: {
    normal: path.join(FONT_DIR, 'Lato-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Lato-Bold.ttf'),
    italics: path.join(FONT_DIR, 'Lato-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'Lato-BoldItalic.ttf'),
  },
  Roboto: {
    normal: path.join(FONT_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Roboto-Medium.ttf'),
    italics: path.join(FONT_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'Roboto-MediumItalic.ttf'),
  },
};

const printer = new PdfPrinter(fonts);

/* ---- Color palette (matches master reference PDF exactly) ---- */
const PURPLE = '#6d2475';
const INK = '#343a40';
const MUTED = '#717684';

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
        pageMargins: [40, 35, 40, 45],
        ...rest,
        defaultStyle: { font: 'Lato', fontSize: 9.5, color: INK, ...defaultStyle },
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

/* ---- Logo block: Permit Declaration with purple tick ---- */
function logoBlock() {
  if (logoBase64) {
    return {
      image: logoBase64,
      width: 152,
    };
  }
  // Fallback vector logo
  return {
    columns: [
      {
        width: 32,
        canvas: [
          { type: 'rect', x: 0, y: 2, w: 28, h: 28, r: 6, color: PURPLE },
          {
            type: 'polyline',
            lineWidth: 3.2,
            lineColor: '#ffffff',
            lineCap: 'round',
            lineJoin: 'round',
            points: [{ x: 7, y: 16 }, { x: 12, y: 21 }, { x: 21, y: 9.5 }],
          },
        ],
      },
      {
        width: '*',
        stack: [
          { text: 'Permit', style: 'wordmark' },
          { text: 'Declaration', style: 'wordmark' },
        ],
        margin: [4, 0, 0, 0],
      },
    ],
  };
}

/* ---- PayNow Badge ---- */
function payNowBadge() {
  if (paynowBase64) {
    return {
      image: paynowBase64,
      width: 110,
      margin: [0, 6, 0, 2],
    };
  }
  return {
    text: 'PAYNOW',
    style: 'payNow',
    margin: [0, 4, 0, 2],
  };
}

/**
 * Compute dynamic spacing parameters based on item count.
 * This ensures the invoice fits on a single A4 page for normal item counts
 * while maintaining pixel-perfect proportions to the reference PDF.
 *
 * A4 dimensions: 595.28pt × 841.89pt
 * Usable height ≈ 771.89pt (841.89 - 35 top - 45 bottom margins).
 */
function getSpacing(itemCount) {
  const fixed = {
    dateLineSize: 9,
    invoiceNoSize: 13,
  };

  if (itemCount <= 3) {
    return {
      ...fixed,
      headerBottomMargin: 20,
      fromToBottomMargin: 16,
      tablePaddingV: 8,
      footerTopMargin: 210,
      fromFontSize: 8.5,
      toFontSize: 8.5,
      partyNameSize: 10,
      cellFontSize: 8.5,
      thFontSize: 8.5,
      totalBoxMarginTop: 2,
    };
  }
  if (itemCount <= 5) {
    return {
      ...fixed,
      headerBottomMargin: 20,
      fromToBottomMargin: 16,
      tablePaddingV: 8,
      footerTopMargin: 170,
      fromFontSize: 8.5,
      toFontSize: 8.5,
      partyNameSize: 10,
      cellFontSize: 8.5,
      thFontSize: 8.5,
      totalBoxMarginTop: 2,
    };
  }
  if (itemCount <= 8) {
    return {
      ...fixed,
      headerBottomMargin: 16,
      fromToBottomMargin: 14,
      tablePaddingV: 6,
      footerTopMargin: 100,
      fromFontSize: 8,
      toFontSize: 8,
      partyNameSize: 9.5,
      cellFontSize: 8,
      thFontSize: 8,
      totalBoxMarginTop: 2,
    };
  }
  if (itemCount <= 10) {
    return {
      ...fixed,
      headerBottomMargin: 12,
      fromToBottomMargin: 12,
      tablePaddingV: 5,
      footerTopMargin: 50,
      fromFontSize: 7.5,
      toFontSize: 7.5,
      partyNameSize: 9,
      cellFontSize: 7.5,
      thFontSize: 7.5,
      totalBoxMarginTop: 1,
    };
  }
  if (itemCount <= 13) {
    return {
      ...fixed,
      headerBottomMargin: 8,
      fromToBottomMargin: 8,
      tablePaddingV: 3.5,
      footerTopMargin: 20,
      fromFontSize: 7,
      toFontSize: 7,
      partyNameSize: 8.5,
      cellFontSize: 7,
      thFontSize: 7,
      totalBoxMarginTop: 0,
    };
  }
  return {
    ...fixed,
    headerBottomMargin: 4,
    fromToBottomMargin: 4,
    tablePaddingV: 2,
    footerTopMargin: 10,
    fromFontSize: 6.5,
    toFontSize: 6.5,
    partyNameSize: 8,
    cellFontSize: 6.5,
    thFontSize: 6.5,
    totalBoxMarginTop: 0,
  };
}

/* ---- Invoice PDF definition (matches master reference PDF exactly) ---- */
function invoicePdfDefinition(invoice, items = [], settings = {}) {
  const currency = settings.default_currency || 'SGD';
  const uenNumber = settings.uen || '201835067C';
  const sp = getSpacing(items.length);

  // Format invoice number defensively
  const rawInvoiceNo = String(invoice.invoice_no || '');
  const formattedInvoiceNo = rawInvoiceNo.startsWith('#')
    ? `Invoice ${rawInvoiceNo}`
    : `Invoice #${rawInvoiceNo}`;

  /* ---- Build item rows ---- */
  const itemRows = items.map((item, idx) => [
    { text: String(idx + 1), style: 'cell', alignment: 'center' },
    { text: (item.productname || '').toUpperCase(), style: 'cell', alignment: 'left' },
    { text: item.description || '', style: 'cell', alignment: 'left' },
    { text: money(item.rate), style: 'cell', alignment: 'right' },
    { text: String(Number(item.quantity || 0)), style: 'cell', alignment: 'center' },
    { text: money(item.total), style: 'cell', alignment: 'right' },
  ]);

  /* ---- "From" address block ---- */
  const fromLines = [
    { text: settings.company_name || 'Chola Logistics Pte Ltd', style: 'partyName' },
  ];
  if (settings.address) {
    fromLines.push({ text: settings.address, style: 'partyLine' });
  }
  const telLine = [
    settings.tel ? `Tel: ${settings.tel}` : null,
    settings.mobile ? `HP: ${settings.mobile}` : null,
  ].filter(Boolean).join(' | ');
  if (telLine) fromLines.push({ text: telLine, style: 'partyLine' });
  if (settings.email) fromLines.push({ text: `Email: ${settings.email}`, style: 'partyLine' });
  if (settings.website) fromLines.push({ text: settings.website, style: 'partyLine' });
  if (settings.contact_no) fromLines.push({ text: `Contact: ${settings.contact_no}`, style: 'partyLine' });

  return {
    background: (currentPage, pageSize) => {
      if (logoBase64) {
        return [
          {
            image: logoBase64,
            width: 320,
            opacity: 0.08,
            absolutePosition: {
              x: (pageSize.width - 320) / 2,
              y: 290,
            },
          },
        ];
      }
      return null;
    },
    footer: (currentPage, pageCount) => ({
      text: 'This is a system generated invoice no authorized signature needed.',
      style: 'systemNotice',
      alignment: 'center',
      margin: [0, 15, 0, 0],
    }),
    content: [
      /* ======== HEADER: Logo left, Date + Invoice # aligned with To column ======== */
      {
        columns: [
          {
            width: 275,
            stack: [logoBlock()],
          },
          {
            width: 240,
            stack: [
              { text: `Date: ${formatDate(invoice.invoice_date)}`, style: 'dateLine' },
              { text: formattedInvoiceNo, style: 'invoiceNo' },
            ],
          },
        ],
        margin: [0, 0, 0, sp.headerBottomMargin],
      },

      /* ======== FROM & TO SECTION (exact same left-alignment for To as Date/Invoice) ======== */
      {
        columns: [
          {
            width: 275,
            stack: [
              { text: 'From:', style: 'partyLabel' },
              ...fromLines,
            ],
          },
          {
            width: 240,
            stack: [
              { text: `To: ${invoice.companyname || ''}`, style: 'partyLabel' },
              {
                text: `Name: ${invoice.person_incharge || ''}`,
                style: 'partyName',
                margin: [0, 4, 0, 2],
              },
              { text: `Address: ${invoice.customer_address || ''}`, style: 'partyLine' },
              {
                text: `Phone: ${invoice.customer_mobile || invoice.customer_contact || ''}`,
                style: 'partyLine',
              },
            ],
          },
        ],
        margin: [0, 0, 0, sp.fromToBottomMargin],
      },

      /* ======== LINE-ITEMS TABLE (Solid Purple Header with White Text) ======== */
      {
        table: {
          headerRows: 1,
          widths: [24, 145, '*', 70, 40, 80],
          body: [
            [
              { text: '#', style: 'th', color: '#ffffff', bold: true, alignment: 'center' },
              { text: 'product name', style: 'th', color: '#ffffff', bold: true, alignment: 'left' },
              { text: 'Description', style: 'th', color: '#ffffff', bold: true, alignment: 'left' },
              { text: `Unit Cost ${currency}`, style: 'th', color: '#ffffff', bold: true, alignment: 'right' },
              { text: 'Qty', style: 'th', color: '#ffffff', bold: true, alignment: 'center' },
              { text: `Total ${currency}`, style: 'th', color: '#ffffff', bold: true, alignment: 'right' },
            ],
            ...itemRows,
          ],
        },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? PURPLE : null),
          hLineWidth: (i, node) => {
            if (i === 0 || i === 1) return 0;
            if (i === node.table.body.length) return 0.75;
            return 0.4;
          },
          vLineWidth: () => 0,
          hLineColor: (i, node) => (i === node.table.body.length ? PURPLE : '#e2e5eb'),
          paddingTop: (i) => (i === 0 ? 7 : sp.tablePaddingV),
          paddingBottom: (i) => (i === 0 ? 7 : sp.tablePaddingV),
          paddingLeft: (i) => (i === 0 ? 4 : 6),
          paddingRight: (i) => (i === 5 ? 6 : 6),
        },
      },

      /* ======== FOOTER: Payment details + Total ======== */
      {
        columns: [
          {
            width: 295,
            stack: [
              { text: 'All Cheques should be crossed and made payable to', style: 'payLead' },
              {
                text: (settings.company_name || 'CHOLA LOGISTICS PTE LTD').toUpperCase(),
                style: 'payee',
              },
              payNowBadge(),
              { text: `UEN: ${uenNumber}`, style: 'uen' },
            ],
          },
          {
            width: 220,
            stack: [
              {
                table: {
                  widths: ['*', 'auto'],
                  body: [
                    [
                      { text: 'Total', style: 'totalLabel', border: [false, true, false, true] },
                      { text: money(invoice.sub_amount), style: 'totalValue', alignment: 'right', border: [false, true, false, true] },
                    ],
                  ],
                },
                layout: {
                  hLineWidth: () => 0.75,
                  vLineWidth: () => 0,
                  hLineColor: () => PURPLE,
                  paddingTop: () => 8,
                  paddingBottom: () => 8,
                  paddingLeft: () => 8,
                  paddingRight: () => 6,
                },
              },
            ],
            margin: [0, 4, 0, 0],
          },
        ],
        margin: [0, sp.footerTopMargin, 0, 0],
      },
    ],

    /* ======== STYLES (exact match to reference PDF) ======== */
    styles: {
      wordmark: { fontSize: 15.5, bold: true, color: PURPLE, lineHeight: 1 },
      dateLine: { fontSize: sp.dateLineSize, color: INK, margin: [0, 0, 0, 3] },
      invoiceNo: { fontSize: sp.invoiceNoSize, bold: true, color: INK },

      partyLabel: { fontSize: sp.fromFontSize, color: INK, bold: false },
      partyName: {
        fontSize: sp.partyNameSize,
        bold: true,
        color: INK,
        margin: [0, 4, 0, 2],
        lineHeight: 1.25,
      },
      partyLine: { fontSize: sp.fromFontSize, color: INK, lineHeight: 1.35 },

      th: { fontSize: sp.thFontSize, color: '#ffffff', bold: true },
      cell: { fontSize: sp.cellFontSize, color: INK, lineHeight: 1.25 },

      payLead: { fontSize: 8.5, color: INK },
      payee: { fontSize: 11, bold: true, color: INK, margin: [0, 3, 0, 0] },
      payNow: { fontSize: 12, bold: true, color: PURPLE },
      uen: { fontSize: 10.5, bold: true, color: INK, margin: [0, 2, 0, 0] },

      totalLabel: { fontSize: 10, color: INK },
      totalValue: { fontSize: 10.5, bold: true, color: INK },
      systemNotice: { fontSize: 10, bold: true, color: INK, italics: true },
    },
  };
}

/* ---- Report PDF (preserved for report generation) ---- */
function reportPdfDefinition(rows, filters, summary) {
  const activeFilters = Object.entries({
    'Company Name': filters.company,
    From: filters.start,
    To: filters.end,
    'Payment Status': filters.paymentStatus,
    Status: filters.status && String(filters.status).toLowerCase() === 'pending' ? 'Unpaid' : filters.status,
    'Invoice No': filters.invoiceNo,
  }).filter(([, v]) => v && v !== 'All').map(([k, v]) => `${k}: ${v}`).join('   •   ');

  const body = [
    [
      { text: 'Invoice No', style: 'th', alignment: 'left', color: '#ffffff', bold: true },
      { text: 'Invoice Date', style: 'th', alignment: 'left', color: '#ffffff', bold: true },
      { text: 'Company Name', style: 'th', alignment: 'left', color: '#ffffff', bold: true },
      { text: 'Sub Amount', style: 'th', alignment: 'right', color: '#ffffff', bold: true },
      { text: 'Status', style: 'th', alignment: 'center', color: '#ffffff', bold: true },
    ],
    ...rows.map((r) => [
      { text: r.invoice_no, style: 'cell', alignment: 'left' },
      { text: formatDate(r.invoice_date), style: 'cell', alignment: 'left' },
      { text: r.companyname, style: 'cell', alignment: 'left' },
      { text: money(r.sub_amount), style: 'cell', alignment: 'right' },
      { text: (r.status && String(r.status).toLowerCase() === 'pending') ? 'Unpaid' : (r.status || ''), style: 'cell', alignment: 'center' },
    ]),
  ];

  return {
    pageOrientation: 'landscape',
    background: (currentPage, pageSize) => {
      if (logoBase64) {
        return [
          {
            image: logoBase64,
            width: 360,
            opacity: 0.08,
            absolutePosition: {
              x: (pageSize.width - 360) / 2,
              y: (pageSize.height - 200) / 2,
            },
          },
        ];
      }
      return null;
    },
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
        table: { headerRows: 1, widths: [130, 110, '*', 110, 90], body },
        layout: {
          fillColor: (i) => (i === 0 ? PURPLE : null),
          hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.75 : 0.4),
          vLineWidth: () => 0,
          hLineColor: (i, node) => (i === 0 || i === node.table.body.length ? PURPLE : '#e2e5eb'),
          paddingTop: (i) => (i === 0 ? 6 : 7),
          paddingBottom: (i) => (i === 0 ? 6 : 7),
          paddingLeft: (i) => (i === 0 ? 6 : 8),
          paddingRight: (i, node) => (i === node.table.widths.length - 1 ? 6 : 8),
        },
      },
      {
        columns: [
          { text: `${rows.length} invoice${rows.length === 1 ? '' : 's'}`, style: 'summary' },
          { text: `Total Amount: ${money(summary.totalAmount)}`, style: 'summary', alignment: 'right' },
        ],
        margin: [0, 16, 0, 0],
      },
      {
        text: 'This is a system generated invoice no authorized signature needed.',
        style: 'systemNotice',
        alignment: 'center',
        margin: [0, 24, 0, 0],
      },
    ],
    styles: {
      wordmark: { fontSize: 13, bold: true, color: PURPLE, lineHeight: 1 },
      title: { fontSize: 16, bold: true, color: INK },
      subtle: { fontSize: 8.5, color: MUTED },
      th: { fontSize: 8.5, color: '#ffffff', bold: true },
      cell: { fontSize: 8.5, color: INK },
      summary: { fontSize: 9.5, bold: true, color: INK },
      payNow: { fontSize: 12, bold: true, color: PURPLE },
      systemNotice: { fontSize: 10, bold: true, color: INK, italics: true },
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
