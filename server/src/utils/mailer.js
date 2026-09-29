const nodemailer = require('nodemailer');

/**
 * Lazily-created singleton Gmail SMTP transport.
 * Credentials come from the environment (SMTP_USER / SMTP_PASS), where
 * SMTP_PASS must be a Gmail App Password.
 */
let transporter = null;

function isMailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isMailConfigured()) return null;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      // Gmail app passwords are often copied with spaces — strip them.
      pass: String(process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    },
  });
  return transporter;
}

/**
 * Send an email. Throws a friendly error when email is not configured.
 * @returns {Promise<import('nodemailer').SentMessageInfo>}
 */
async function sendMail({ to, cc, subject, text, html, attachments, replyTo }) {
  const tx = getTransporter();
  if (!tx) {
    const err = new Error('Email is not configured. Set SMTP_USER and SMTP_PASS in the server .env.');
    err.statusCode = 400;
    throw err;
  }
  const fromName = process.env.SMTP_FROM_NAME || 'Accounts';
  return tx.sendMail({
    from: `"${fromName}" <${process.env.SMTP_USER}>`,
    to,
    cc: cc && (Array.isArray(cc) ? cc.length : cc) ? cc : undefined,
    subject,
    text,
    html,
    attachments,
    replyTo,
  });
}

module.exports = { sendMail, isMailConfigured };
