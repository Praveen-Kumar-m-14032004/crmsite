/**
 * Build the subject / plain-text / HTML body for the "email invoice to
 * customer" feature, following the company's standard accounts email format.
 * Dynamic values come from the invoice and company settings; company-specific
 * details (bank account, signature) come from env with sensible fallbacks.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
    .replace(/>/g, '&gt;');
}

function buildInvoiceEmail(invoice = {}, settings = {}) {
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
  const LINK = 'color:#1155cc; text-decoration:underline;';

  const subject = `PERMIT DECLARATION INVOICE FOR THE MONTH ${period.toUpperCase()}`.trim();

  const textLines = [
    `Dear ${greetingName},`,
    '',
    `Good day to you.  Kindly refer to the attached Invoice for ${period}. Please process the payment.`,
    '',
    `Pay Now Number:  UEN: ${uen}`,
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
    '',
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
  ];
  const text = textLines.join('\n');

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #222; line-height: 1.6;">
    <p>Dear ${esc(greetingName)},</p>
    <p>Good day to you. Kindly refer to the attached Invoice for <strong>${esc(period)}</strong>. Please process the payment.</p>
    <p><strong>Pay Now Number:</strong> UEN: ${esc(uen)}</p>
    <p>
      Bank account details are as follows:<br>
      ACCOUNT NAME : ${esc(bankName)}<br>
      DBS CURRENT ACCOUNT NO : ${esc(bankNo)}
    </p>
    <p style="color:#e11d1d; font-weight:bold; font-style:italic;">**Please ensure payment within 7 days from the invoice receipt date.**</p>
    <p>Our aim is to secure a long-term business partnership with our customers.</p>
    <p style="font-style:italic;">Appreciate acknowledgement of this email. &amp; Your business is more important.</p>
    <p style="margin-bottom: 2px;"><strong>Thanks &amp; Best Regards,</strong></p>
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
    </p>
  </div>`;

  return { subject, text, html };
}

module.exports = { buildInvoiceEmail, monthYear };
