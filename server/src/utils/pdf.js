const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
const PAYNOW_PATH = path.join(__dirname, '..', 'assets', 'paynow.png');

/* ---- Pre-compute asset buffers at module load (once, not per PDF) ---- */
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
    normal: fs.readFileSync(path.join(FONT_DIR, 'Lato-Regular.ttf')),
    bold: fs.readFileSync(path.join(FONT_DIR, 'Lato-Bold.ttf')),
    italics: fs.readFileSync(path.join(FONT_DIR, 'Lato-Italic.ttf')),
    bolditalics: fs.readFileSync(path.join(FONT_DIR, 'Lato-BoldItalic.ttf')),
  },
  Roboto: {
    normal: fs.readFileSync(path.join(FONT_DIR, 'Roboto-Regular.ttf')),
    bold: fs.readFileSync(path.join(FONT_DIR, 'Roboto-Medium.ttf')),
    italics: fs.readFileSync(path.join(FONT_DIR, 'Roboto-Italic.ttf')),
    bolditalics: fs.readFileSync(path.join(FONT_DIR, 'Roboto-MediumItalic.ttf')),
  },
};

// Singleton printer – reuse across all PDF generations with in-memory fonts
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
  if (typeof d === 'string') {
    const raw = d.slice(0, 10);
    const parts = raw.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Build a PDF from a doc definition and return the full buffer.
 * Use this when you need the complete buffer (e.g. for caching).
 */
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

/**
 * Create a pdfmake doc stream that can be piped directly to an HTTP response.
 * Use this for uncached PDF generation to reduce TTFB — the browser starts
 * receiving bytes before the entire PDF is finished rendering.
 */
function createPdfStream(docDefinition) {
  const { defaultStyle, ...rest } = docDefinition;
  const doc = printer.createPdfKitDocument({
    pageSize: 'A4',
    pageMargins: [40, 35, 40, 45],
    ...rest,
    defaultStyle: { font: 'Lato', fontSize: 9.5, color: INK, ...defaultStyle },
  });
  doc.end();
  return doc;
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
 * Ensure cell text wraps gracefully in PDF cells without pushing table columns.
 * Standardizes delimiter spacing (, and ;) and uses soft zero-width breaks
 * on very long continuous tokens (>24 chars) without corrupting word contents.
 */
function formatCellText(str) {
  if (!str) return '';
  const lines = String(str).split('\n');
  return lines
    .map((line) => {
      let trimmed = line.trim();
      // Ensure clean spacing after commas and semicolons
      trimmed = trimmed
        .replace(/,\s*/g, ', ')
        .replace(/;\s*/g, '; ');
      // Use zero-width space \u200B for soft line breaks on unbroken strings > 24 chars
      return trimmed
        .split(' ')
        .map((word) => {
          if (word.length > 24) {
            const chunks = word.match(/.{1,14}/g) || [word];
            return chunks.join('\u200B');
          }
          return word;
        })
        .join(' ');
    })
    .join('\n');
}

/**
 * Estimate rendered line count for an item (product name + description).
 */
function estimateItemLines(item) {
  const prodLen = (item.productname || '').length;
  const desc = String(item.description || '');
  const descLines = desc.split('\n');
  let totalDescLines = 0;
  for (const line of descLines) {
    totalDescLines += Math.max(1, Math.ceil(line.length / 28));
  }
  const prodLines = Math.max(1, Math.ceil(prodLen / 20));
  return Math.max(prodLines, totalDescLines);
}

/**
 * Compute dynamic spacing parameters based on items and total line count.
 * This ensures the invoice fits comfortably on a single A4 page for normal
 * and multi-line descriptions while maintaining proportions.
 *
 * A4 dimensions: 595.28pt × 841.89pt
 * Usable height ≈ 771.89pt (841.89 - 35 top - 45 bottom margins).
 */
function getSpacing(items) {
  const itemsList = Array.isArray(items) ? items : (typeof items === 'number' ? new Array(items).fill({}) : []);
  const itemCount = itemsList.length;
  const totalLines = itemsList.reduce((sum, it) => sum + estimateItemLines(it), 0);

  const fixed = {
    dateLineSize: 9,
    invoiceNoSize: 13,
  };

  // Determine effective height factor combining row count and description lines
  const effectiveCount = Math.max(itemCount, Math.ceil(totalLines * 0.75));

  if (effectiveCount <= 2) {
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
  if (effectiveCount <= 4) {
    return {
      ...fixed,
      headerBottomMargin: 18,
      fromToBottomMargin: 14,
      tablePaddingV: 7,
      footerTopMargin: 120,
      fromFontSize: 8.5,
      toFontSize: 8.5,
      partyNameSize: 10,
      cellFontSize: 8.5,
      thFontSize: 8.5,
      totalBoxMarginTop: 2,
    };
  }
  if (effectiveCount <= 7) {
    return {
      ...fixed,
      headerBottomMargin: 14,
      fromToBottomMargin: 12,
      tablePaddingV: 5.5,
      footerTopMargin: 60,
      fromFontSize: 8,
      toFontSize: 8,
      partyNameSize: 9.5,
      cellFontSize: 8,
      thFontSize: 8,
      totalBoxMarginTop: 2,
    };
  }
  if (effectiveCount <= 10) {
    return {
      ...fixed,
      headerBottomMargin: 10,
      fromToBottomMargin: 10,
      tablePaddingV: 4.5,
      footerTopMargin: 30,
      fromFontSize: 7.5,
      toFontSize: 7.5,
      partyNameSize: 9,
      cellFontSize: 7.5,
      thFontSize: 7.5,
      totalBoxMarginTop: 1,
    };
  }
  if (effectiveCount <= 14) {
    return {
      ...fixed,
      headerBottomMargin: 6,
      fromToBottomMargin: 6,
      tablePaddingV: 3,
      footerTopMargin: 15,
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
  const sp = getSpacing(items);

  // Format invoice number defensively
  const rawInvoiceNo = String(invoice.invoice_no || '');
  const formattedInvoiceNo = rawInvoiceNo.startsWith('#')
    ? `Invoice ${rawInvoiceNo}`
    : `Invoice #${rawInvoiceNo}`;

  /* ---- Build item rows ---- */
  const itemRows = items.map((item, idx) => [
    { text: String(idx + 1), style: 'cell', alignment: 'center' },
    { text: formatCellText(item.productname || '').toUpperCase(), style: 'cell', alignment: 'left' },
    { text: formatCellText(item.description || ''), style: 'cell', alignment: 'left' },
    { text: money(item.rate), style: 'cell', alignment: 'left' },
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
      /* ======== HEADER: Logo left, Date + Invoice # right ======== */
      {
        columns: [
          {
            width: 360,
            stack: [logoBlock()],
          },
          {
            width: 155,
            stack: [
              { text: `Date: ${formatDate(invoice.invoice_date)}`, style: 'dateLine' },
              { text: formattedInvoiceNo, style: 'invoiceNo' },
            ],
          },
        ],
        margin: [0, 0, 0, sp.headerBottomMargin],
      },

      /* ======== FROM & TO SECTION (To section moved left) ======== */
      {
        columns: [
          {
            width: 295,
            stack: [
              { text: 'From:', style: 'partyLabel' },
              ...fromLines,
            ],
          },
          {
            width: 220,
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
          dontBreakRows: true,
          widths: [20, 130, '*', 65, 35, 75],
          body: [
            [
              { text: '#', style: 'th', color: '#ffffff', bold: true, alignment: 'center' },
              { text: 'product name', style: 'th', color: '#ffffff', bold: true, alignment: 'left' },
              { text: 'Description', style: 'th', color: '#ffffff', bold: true, alignment: 'left' },
              { text: `Unit Cost ${currency}`, style: 'th', color: '#ffffff', bold: true, alignment: 'left' },
              { text: 'Qty', style: 'th', color: '#ffffff', bold: true, alignment: 'center' },
              { text: `Total ${currency}`, style: 'th', color: '#ffffff', bold: true, alignment: 'right' },
            ],
            ...itemRows,
          ],
        },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? PURPLE : null),
          hLineWidth: (i, node) => {
            if (i === 0) return 0;
            return 0.75;
          },
          vLineWidth: () => 0,
          hLineColor: () => PURPLE,
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

function quotationPdfDefinition(quotation = {}, company = {}) {
  const quoteDate = formatDate(quotation.quotation_date || quotation.date || new Date());
  const quoteNo = quotation.quotation_no || 'PD-0926-0001';

  const defaultRates = [
    { type: 'EXPORT PERMITS', charge: '11.00 SGD' },
    { type: 'IMPORT PERMITS', charge: '11.00 SGD' },
    { type: 'IMPORTER OF THE RECORD', charge: '30.00 SGD' },
    { type: 'USING PERMIT DECLARATION SFA LICENSE', charge: '25.00 SGD' },
    { type: 'CERTIFICATE OF ORIGINS', charge: '50.00 SGD' },
    { type: 'PERMIT AMENDMENTS', charge: '0.50 SGD' },
    { type: 'CANCELLATION/REJECTION', charge: '0.50 SGD' },
  ];

  const items = quotation.items && quotation.items.length > 0 ? quotation.items : defaultRates;

  const defaultTurnarounds = [
    { priority: 'Normal Requests', timing: 'Within 2hrs from time of Request' },
    { priority: 'Urgent Requests', timing: 'Within 60mins of Request' },
    { priority: 'Super Urgent Requests', timing: 'Within 30 mins of Request' },
    { priority: 'Tier1/Control countries/Other Controlling Agencies', timing: 'Depending upon the Customs queue' },
  ];

  const turnarounds = quotation.turnarounds && quotation.turnarounds.length > 0 ? quotation.turnarounds : defaultTurnarounds;

  const opsEmail = quotation.ops_email || company.email || 'Ops@aula.com.sg';
  const ccEmail = quotation.cc_email || 'Customspermit.sg@gmail.com';
  const contacts = quotation.contact_numbers || '+65 8370 1443 & +65 8919 7865 / +65 8322 5509';

  return {
    pageSize: 'A4',
    pageMargins: [36, 26, 36, 26],
    content: [
      // Top Header: Logo on left, Date & Quotation No on right
      {
        columns: [
          {
            width: '*',
            stack: [logoBlock()],
          },
          {
            width: 'auto',
            stack: [
              { text: `DATE : ${quoteDate}`, bold: true, fontSize: 9, alignment: 'right' },
              { text: `Quotaion No : ${quoteNo}`, bold: true, fontSize: 9, alignment: 'right', margin: [0, 3, 0, 0] },
            ],
          },
        ],
        margin: [0, 0, 0, 10],
      },

      // Customer Info
      {
        stack: [
          { text: quotation.companyname || 'DJCARGO', bold: true, fontSize: 10 },
          { text: `Address : ${quotation.address || '71 WOODLANDS INDUSTRIAL PARK E9 #01-19 SINGAPORE 757048'}`, fontSize: 8.5, margin: [0, 3, 0, 0] },
          {
            columns: [
              { text: `Person Incharge : ${quotation.person_incharge || 'Person In-Charge'}`, width: 'auto', fontSize: 8.5 },
            ],
            margin: [0, 2, 0, 0],
          },
          { text: `Tele : ${quotation.mobile_no || quotation.tele || '+65 88359180'}`, fontSize: 8.5, margin: [0, 2, 0, 0] },
        ],
        margin: [0, 0, 0, 10],
      },

      // Official Quotation Title
      {
        text: 'OFFICIAL QUOTATION FOR PERMIT DECLARATIONS',
        bold: true,
        fontSize: 10,
        alignment: 'center',
        margin: [0, 0, 0, 6],
      },

      // Table 1: Permit Types & Charges
      {
        table: {
          headerRows: 1,
          widths: ['*', 130],
          body: [
            [
              { text: 'PERMIT TYPES', bold: true, fontSize: 8.5, alignment: 'center', fillColor: '#f8f9fa' },
              { text: 'PERMIT CHARGES', bold: true, fontSize: 8.5, alignment: 'center', fillColor: '#f8f9fa' },
            ],
            ...items.map((it) => [
              { text: it.type || it.productname || '', fontSize: 8, margin: [6, 2.5, 6, 2.5] },
              { text: it.charge || `${Number(it.rate || 0).toFixed(2)} SGD`, fontSize: 8, alignment: 'center', margin: [4, 2.5, 4, 2.5] },
            ]),
          ],
        },
        layout: {
          hLineWidth: () => 0.65,
          vLineWidth: () => 0.65,
          hLineColor: () => '#444444',
          vLineColor: () => '#444444',
        },
        margin: [0, 0, 0, 6],
      },

      // Item Cost Note
      {
        stack: [
          { text: 'Item Cost :', bold: true, fontSize: 8.5 },
          { text: '1st to 10th items No Charges', fontSize: 8, margin: [0, 1, 0, 0] },
          {
            text: [
              { text: 'From 11th items onwards additional charge ', fontSize: 8 },
              { text: 'SGD 0.50 Cents per line item', bold: true, fontSize: 8 },
            ],
            margin: [0, 1, 0, 0],
          },
        ],
        margin: [0, 0, 0, 8],
      },

      // Turnaround Time Title
      {
        text: '(PERMIT TURN-AROUND TIME)',
        bold: true,
        fontSize: 9,
        alignment: 'center',
        margin: [0, 0, 0, 5],
      },

      // Table 2: Priority & Timings
      {
        table: {
          headerRows: 1,
          widths: ['42%', '58%'],
          body: [
            [
              { text: 'Priority :', bold: true, fontSize: 8.5, alignment: 'center', fillColor: '#f8f9fa' },
              { text: 'Permit Returning Timings :', bold: true, fontSize: 8.5, alignment: 'center', fillColor: '#f8f9fa' },
            ],
            ...turnarounds.map((t) => [
              { text: t.priority, fontSize: 7.8, margin: [6, 2.2, 6, 2.2] },
              { text: t.timing, fontSize: 7.8, alignment: 'center', margin: [4, 2.2, 4, 2.2] },
            ]),
          ],
        },
        layout: {
          hLineWidth: () => 0.65,
          vLineWidth: () => 0.65,
          hLineColor: () => '#444444',
          vLineColor: () => '#444444',
        },
        margin: [0, 0, 0, 7],
      },

      // Procedures
      {
        stack: [
          { text: 'Procedures :', bold: true, fontSize: 8.5 },
          { text: 'To facilitate the customs permit application, kindly provide the following documents:', fontSize: 7.8, margin: [0, 1.5, 0, 0] },
          { text: '. BL COPY / AWB COPY / Commercial Invoice / Packing List / NOA / BKG Form', fontSize: 7.8, margin: [0, 1.5, 0, 0] },
          {
            text: [
              { text: 'Send Your Permit Request To Our Ops Team : ', bold: true, fontSize: 7.8 },
              { text: `Email: ${opsEmail} | CC: ${ccEmail}`, bold: true, fontSize: 7.8 },
            ],
            margin: [0, 1.5, 0, 0],
          },
          { text: 'Upon receipt of the required documents, our ops team will process your permit application promptly. Approved permit(s) will be forwarded to your email upon successful approval by Singapore Customs.', fontSize: 7.8, margin: [0, 1.5, 0, 0] },
        ],
        margin: [0, 0, 0, 6],
      },

      // Operating Hours
      {
        stack: [
          { text: 'Operating Hours :', bold: true, fontSize: 8.5 },
          {
            text: [
              { text: '24 Hours | 7 Days a Week | Including Public Holidays at ', fontSize: 7.8 },
              { text: 'NO EXTRA COST', bold: true, fontSize: 7.8 },
            ],
            margin: [0, 1.5, 0, 0],
          },
          { text: 'We provide 24/7 Customs Permit Declaration Services to support your import and export operations at any time.', fontSize: 7.8, margin: [0, 1.5, 0, 0] },
          {
            text: [
              { text: '24/7 Assistance WhatsApp / Contact: ', bold: true, fontSize: 7.8 },
              { text: contacts, bold: true, fontSize: 7.8 },
            ],
            margin: [0, 1.5, 0, 0],
          },
          {
            text: [
              { text: 'Express Permit Processing : ', bold: true, fontSize: 7.8 },
              { text: 'Additional SGD 10.00 per permit.', fontSize: 7.8 },
            ],
            margin: [0, 1.5, 0, 0],
          },
        ],
        margin: [0, 0, 0, 6],
      },

      // Terms & Conditions
      {
        stack: [
          { text: 'Terms & Conditions :', bold: true, fontSize: 8.5 },
          { text: '. Payment for Declaration services shall be made within 7 days from the invoice date.', fontSize: 7.6, margin: [0, 1.2, 0, 0] },
          { text: ". Under our GIRO arrangement with Singapore Customs, all applicable GST, Customs Duties, and Government charges are deducted directly from our company's GIRO account.", fontSize: 7.6, margin: [0, 1.2, 0, 0] },
          { text: ". Customers are required to transfer the applicable GST and DUTY charges to our company's designated UOB bank account before permit submission and approval.", fontSize: 7.6, margin: [0, 1.2, 0, 0] },
          { text: '. Permit application will be processed for approval only after the GST payment has been received.', fontSize: 7.6, margin: [0, 1.2, 0, 0] },
          { text: '. Additional charges may apply for permit amendments, cancellations, controlled goods, licence applications, or other special customs requirements.', fontSize: 7.6, margin: [0, 1.2, 0, 0] },
          { text: '. Unless otherwise stated, this quotation is valid for 10 days from the date of issue.', fontSize: 7.6, margin: [0, 1.2, 0, 0] },
          { text: 'Thank you for choosing Permit Declaration Services. We look forward to serving you with fast, reliable, and professional support 24/7.', fontSize: 7.6, margin: [0, 2, 0, 0] },
        ],
        margin: [0, 0, 0, 10],
      },

      // Sign-off block (clean, no specific CEO name per user's feedback)
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 220,
            alignment: 'right',
            stack: [
              { text: 'THANKS & BEST REGARDS', bold: true, fontSize: 8.5, alignment: 'right' },
              { text: 'YOURS FAITHFULLY', fontSize: 8, alignment: 'right', margin: [0, 14, 0, 18] },
              { text: '.......................................................', color: '#999999', fontSize: 8, alignment: 'right' },
              { text: '(AUTHORISED SIGNATURE)', bold: true, fontSize: 8, alignment: 'right', margin: [0, 2, 0, 0] },
            ],
          },
        ],
      },
    ],
    styles: {
      wordmark: { fontSize: 13, bold: true, color: PURPLE, lineHeight: 1 },
    },
    defaultStyle: { font: 'Lato', fontSize: 8, color: INK },
  };
}

module.exports = {
  buildPdf,
  createPdfStream,
  invoicePdfDefinition,
  quotationPdfDefinition,
  reportPdfDefinition,
  formatDate,
  money,
};

