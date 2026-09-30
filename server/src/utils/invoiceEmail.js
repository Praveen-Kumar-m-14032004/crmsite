/**
 * Build the subject / plain-text / HTML body for the "email invoice to
 * customer" feature, following the company's standard accounts email format.
 * Dynamic values come from the invoice and company settings; company-specific
 * details (bank account, signature) come from env with sensible fallbacks.
 *
 * The email has three parts:
 *   subject   - default generated from the invoice month, editable per send
 *   body      - the message ("Dear ... Your business is more important."),
 *               default generated from the invoice, editable per send
 *   signature - company sign-off and contact block, always appended as is
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 10000;

function monthYear(dateStr) {
  if (!dateStr) return '';
  const raw = String(dateStr).slice(0, 10);
  const [y, m] = raw.split('-');
  const mi = Number(m) - 1;
  if (y && mi >= 0 && mi < 12) return `${MONTHS[mi]} ${y}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return raw;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LINK = 'color:#1155cc; text-decoration:underline;';

/** A subject is a single header line: collapse line breaks and surrounding space. */
function cleanSubject(value) {
  return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Normalise an edited message so it can be compared with the default and sent. */
function cleanBody(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

/** Turn email addresses and web addresses in already-escaped text into links. */
function linkify(escaped) {
  return escaped.replace(
    /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)])/g,
    (match, email, url) => {
      if (email) return `<a href="mailto:${email}" style="${LINK}">${email}</a>`;
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return `<a href="${href}" style="${LINK}">${url}</a>`;
    }
  );
}

/**
 * Render an edited plain-text message as HTML: blank lines separate paragraphs,
 * single line breaks are kept, and a paragraph wrapped in **double asterisks**
 * is highlighted the same way as the default payment reminder.
 */
function messageToHtml(text) {
  return cleanBody(text)
    .split(/\n{2,}/)
    .map((block) => {
      const inner = linkify(esc(block)).replace(/\n/g, '<br>');
      return /^\*\*[\s\S]+\*\*$/.test(block)
        ? `<p style="color:#e11d1d; font-weight:bold; font-style:italic;">${inner}</p>`
        : `<p>${inner}</p>`;
    })
    .join('\n    ');
}

/**
 * @param {object} invoice   invoice with customer fields (see getInvoiceWithItems)
 * @param {object} settings  company settings
 * @param {{subject?: string, body?: string}} overrides  edited subject / message
 */
function buildInvoiceEmail(invoice = {}, settings = {}, overrides = {}) {
  const period = monthYear(invoice.invoice_date);
  const greetingName = (invoice.person_incharge && String(invoice.person_incharge).trim()) || 'Mam';
  const uen = settings.uen || '201835067C';

  // Company-specific details — env override, else the standard company values.
  const bankName = process.env.BANK_ACCOUNT_NAME || 'CHOLA LOGISTICS PTE. LTD.';
  const bankNo = process.env.BANK_ACCOUNT_NO || '074-9033-177';
  const signerName = process.env.EMAIL_SIGNER_NAME || 'Sandhiya';
  const signerTitle = process.env.EMAIL_SIGNER_TITLE || 'Assistant Accounts Manager';
  const companyLine = (settings.company_name || 'CHOLA PERMITS').toUpperCase();

  const address = settings.address || 'Blk 640 Rowell Rd, #01-54\nSingapore 200640';
  const tel = settings.tel || '+65 6291 7747';
  const hp = settings.mobile || '+65 90144400';
  const email1 = settings.email || 'sales@permitdeclaration.com.sg';
  const email2 = 'support@permitdeclaration.com.sg';
  const website = settings.website || 'www.permitdeclaration.com.sg';

  const telHref = `tel:${tel.replace(/[^+\d]/g, '')}`;
  const hpHref = `tel:${hp.replace(/[^+\d]/g, '')}`;
  const webHref = /^https?:\/\//i.test(website) ? website : `https://${website}`;

  /* ---------- defaults generated from the invoice ---------- */

  const defaultSubject = `PERMIT DECLARATION INVOICE FOR THE MONTH ${period.toUpperCase()}`.trim();

  const defaultBody = [
    `Dear ${greetingName},`,
    '',
    `Good day to you. Kindly refer to the attached Invoice for ${period}. Please process the payment.`,
    '',
    `Pay Now Number: UEN: ${uen}`,
    '',
    'Bank account details are as follows:',
    `ACCOUNT NAME : ${bankName}`,
    `DBS CURRENT ACCOUNT NO : ${bankNo}`,
    '',
    '**Please ensure payment within 7 days from the invoice receipt date.**',
    '',
    'Our aim is to secure a long-term business partnership with our customers.',
    '',
    'Appreciate acknowledgement of this email. & Your business is more important.',
  ].join('\n');

  const defaultBodyHtml = `<p>Dear ${esc(greetingName)},</p>
    <p>Good day to you. Kindly refer to the attached Invoice for <strong>${esc(period)}</strong>. Please process the payment.</p>
    <p><strong>Pay Now Number:</strong> UEN: ${esc(uen)}</p>
    <p>
      Bank account details are as follows:<br>
      ACCOUNT NAME : ${esc(bankName)}<br>
      DBS CURRENT ACCOUNT NO : ${esc(bankNo)}
    </p>
    <p style="color:#e11d1d; font-weight:bold; font-style:italic;">**Please ensure payment within 7 days from the invoice receipt date.**</p>
    <p>Our aim is to secure a long-term business partnership with our customers.</p>
    <p style="font-style:italic;">Appreciate acknowledgement of this email. &amp; Your business is more important.</p>`;

  /* ---------- signature: always appended, never edited ---------- */

  const signature = [
    'Thanks & Best Regards,',
    `${signerName} | ${signerTitle}`,
    companyLine,
    '--------------------------------------------------',
    ...address.split('\n'),
    `Tel : ${tel}`,
    `HP  : ${hp} (WhatsApp 24x7 Assistance)`,
    `Email : ${email1}`,
    email2,
    `Web : ${website}`,
  ].join('\n');

  const signatureHtml = `<p style="margin-bottom: 2px;"><strong>Thanks &amp; Best Regards,</strong></p>
    <p style="margin:0;">
      <strong>${esc(signerName)} | ${esc(signerTitle)}</strong><br>
      <strong>${esc(companyLine)}</strong>
    </p>
    <hr style="border:none; border-top:1px solid #4a90d9; margin:8px 0 10px; max-width:520px;">
    <p style="margin:0;">
      📍 ${esc(address).replace(/\n/g, '<br>')}<br>
      📞 : <a href="${esc(telHref)}" style="${LINK}">${esc(tel)}</a><br>
      HP&nbsp; : <a href="${esc(hpHref)}" style="${LINK}">${esc(hp)}</a> (WhatsApp 24x7 Assistance)<br>
      ✉️ : <a href="mailto:${esc(email1)}" style="${LINK}">${esc(email1)}</a><br>
      <a href="mailto:${esc(email2)}" style="${LINK}">${esc(email2)}</a><br>
      🌐 : <a href="${esc(webHref)}" style="${LINK}">${esc(website)}</a>
    </p>`;

  /* ---------- apply edits ---------- */

  const subject = cleanSubject(overrides.subject) || defaultSubject;
  const editedBody = cleanBody(overrides.body);
  // An untouched message keeps the richer default formatting (bold month etc.).
  const bodyEdited = Boolean(editedBody) && editedBody !== cleanBody(defaultBody);
  const body = bodyEdited ? editedBody : defaultBody;
  const bodyHtml = bodyEdited ? messageToHtml(editedBody) : defaultBodyHtml;

  const text = `${body}\n\n${signature}`;
  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #222; line-height: 1.6;">
    ${bodyHtml}
    ${signatureHtml}
  </div>`;

  return {
    subject,
    text,
    html,
    body,
    signature,
    edited: { subject: subject !== defaultSubject, body: bodyEdited },
    defaults: { subject: defaultSubject, body: defaultBody },
  };
}

module.exports = {
  buildInvoiceEmail,
  monthYear,
  cleanSubject,
  cleanBody,
  messageToHtml,
  MAX_SUBJECT_LENGTH,
  MAX_BODY_LENGTH,
};
