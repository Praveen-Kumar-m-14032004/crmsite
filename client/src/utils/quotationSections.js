/**
 * Quotation document content: editable text sections, per-section visibility and
 * per-item visibility. Mirrored on the server in server/src/utils/quotationSections.js.
 *
 * - Sections are pre-filled with the defaults below for new quotations; older
 *   quotations that predate a field fall back to the same defaults.
 * - `visibility` lets each section (and the item Description column) be hidden
 *   from the quotation view and PDF without losing its text.
 * - Each line item may carry `hidden: true`; such items stay saved but are left
 *   out of the document and of the total.
 */

export const VISIBILITY_KEYS = [
  'doc_title', 'description', 'item_cost', 'turnaround', 'procedures',
  'operating_hours', 'terms', 'closing_note', 'notes',
];

export const VISIBILITY_LABELS = {
  doc_title: 'Document Title',
  description: 'Description column',
  item_cost: 'Item Cost',
  turnaround: 'Permit Turn-Around Time',
  procedures: 'Procedures',
  operating_hours: 'Operating Hours',
  terms: 'Terms & Conditions',
  closing_note: 'Closing Note',
  notes: 'Additional Notes',
};

export function defaultVisibility() {
  return Object.fromEntries(VISIBILITY_KEYS.map((key) => [key, true]));
}

/** Stored visibility merged over "everything shown"; unknown or missing keys show. */
export function resolveVisibility(quotation = {}) {
  const stored = quotation.visibility && typeof quotation.visibility === 'object' ? quotation.visibility : {};
  return Object.fromEntries(VISIBILITY_KEYS.map((key) => [key, stored[key] !== false]));
}

export function buildDefaultSections({
  currency = 'SGD',
  companyName = 'Chola Logistics Pte Ltd',
  email = 'accounts@permitdeclaration.com.sg',
  contact = '',
} = {}) {
  return {
    doc_title: 'OFFICIAL QUOTATION FOR PERMIT DECLARATIONS',
    item_cost:
      '1st to 10th items No Charges\n' +
      `From 11th items onwards additional charge ${currency} 0.50 Cents per line item`,
    turnaround: [
      { priority: 'Normal Requests', timing: 'Within 2hrs from time of Request' },
      { priority: 'Urgent Requests', timing: 'Within 60mins of Request' },
      { priority: 'Super Urgent Requests', timing: 'Within 30 mins of Request' },
      { priority: 'Tier1/Control countries/Other Controlling Agencies', timing: 'Depending upon the Customs queue' },
    ],
    procedures:
      'To facilitate the customs permit application, kindly provide the following documents:\n' +
      '.  BL COPY / AWB COPY / Commercial Invoice / Packing List / NOA / BKG Form\n' +
      `Send Your Permit Request To Our Ops Team : Email: ${email}\n` +
      'Upon receipt of the required documents, our ops team will process your permit application promptly. ' +
      'Approved permit(s) will be forwarded to your email upon successful approval by Singapore Customs.',
    operating_hours:
      '24 Hours | 7 Days a Week | Including Public Holidays at NO EXTRA COST\n' +
      'We provide 24/7 Customs Permit Declaration Services to support your import and export operations at any time.\n' +
      `24/7 Assistance WhatsApp / Contact: ${contact}\n` +
      `Express Permit Processing : Additional ${currency} 10.00 per permit.`,
    terms: [
      'Payment for Declaration services shall be made within 7 days from the invoice date.',
      "Under our GIRO arrangement with Singapore Customs, all applicable GST, Customs Duties, and Government charges are deducted directly from our company's GIRO account.",
      "Customers are required to transfer the applicable GST and DUTY charges to our company's designated UOB bank account before permit submission and approval.",
      'Permit application will be processed for approval only after the GST payment has been received.',
      'Additional charges may apply for permit amendments, cancellations, controlled goods, licence applications, or other special customs requirements.',
      'Unless otherwise stated, this quotation is valid for 10 days from the date of issue.',
    ],
    closing_note:
      `Thank you for choosing ${companyName} Permit Declaration Services.\n\n` +
      'We look forward to serving you with fast, reliable, and professional support 24/7.',
  };
}

/**
 * Merge whatever a quotation stored over the defaults, so old records (which
 * have none of these fields) still render a complete document.
 */
export function resolveSections(quotation = {}, opts = {}) {
  const d = buildDefaultSections(opts);
  const turnaround = Array.isArray(quotation.turnaround) && quotation.turnaround.length
    ? quotation.turnaround
    : d.turnaround;
  const terms = Array.isArray(quotation.terms) && quotation.terms.length ? quotation.terms : d.terms;
  return {
    doc_title: quotation.doc_title ?? d.doc_title,
    item_cost: quotation.item_cost ?? d.item_cost,
    turnaround,
    procedures: quotation.procedures ?? d.procedures,
    operating_hours: quotation.operating_hours ?? d.operating_hours,
    terms,
    closing_note: quotation.closing_note ?? d.closing_note,
  };
}

/** Split a multi-line section into non-empty trimmed lines for rendering. */
export function toLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Line items that appear on the document (and count towards the total). */
export function visibleItems(items) {
  return (Array.isArray(items) ? items : []).filter((it) => it && it.hidden !== true);
}

/** Rate x quantity, rounded to cents. A missing quantity counts as 1. */
export function lineTotal(item = {}) {
  const rate = Number(item.rate) || 0;
  const qty = Number(item.quantity);
  const quantity = item.quantity === undefined || item.quantity === null || item.quantity === '' || isNaN(qty) || qty <= 0 ? 1 : qty;
  return Math.round(rate * quantity * 100) / 100;
}

/** Total of the visible line items. */
export function visibleTotal(items) {
  return Math.round(visibleItems(items).reduce((sum, it) => sum + lineTotal(it), 0) * 100) / 100;
}
