import { useEffect, useState } from 'react';
import { invoicesApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { MailIcon, SpinnerIcon } from './Icons';

/**
 * Dialog to email an invoice PDF to the customer.
 * Prefills the recipient with the customer's email on file (fetched on open),
 * and lets the user edit it before sending.
 */
export default function EmailInvoiceDialog({ invoice, onClose }) {
  const toast = useToast();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!invoice) return undefined;
    let alive = true;
    setLoading(true);
    setTo('');
    setCc('');
    invoicesApi.get(invoice.id)
      .then((res) => { if (alive) setTo(res.data?.customer_email || ''); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [invoice]);

  useEffect(() => {
    if (!invoice) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [invoice, sending, onClose]);

  if (!invoice) return null;

  const handleSend = async () => {
    const email = to.trim();
    if (!email) { toast.error('Enter at least one recipient email address'); return; }
    setSending(true);
    try {
      const res = await invoicesApi.emailInvoice(invoice.id, { email, cc: cc.trim() });
      toast.success(res.data?.message || `Invoice emailed to ${email}`);
      onClose(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send the invoice email'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="overlay" onClick={() => !sending && onClose(false)}>
      <div className="dialog" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <span className="dialog-icon"><MailIcon width={20} height={20} /></span>
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>Email invoice #{invoice.invoice_no}</h3>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          The invoice PDF will be attached and sent to the customer{invoice.companyname ? ` (${invoice.companyname})` : ''}.
        </p>

        <div className="form-field" style={{ marginTop: 16, textAlign: 'left' }}>
          <label htmlFor="emailTo">To</label>
          <input
            id="emailTo"
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={loading ? 'Loading customer email…' : 'name@example.com, another@example.com'}
            disabled={loading || sending}
            autoFocus
          />
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
            {!loading && !to
              ? 'No email on file for this customer — enter one to send.'
              : 'Separate multiple email addresses with commas.'}
          </div>
        </div>

        <div className="form-field" style={{ marginTop: 12, textAlign: 'left' }}>
          <label htmlFor="emailCc">CC <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
          <input
            id="emailCc"
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="cc1@example.com, cc2@example.com"
            disabled={loading || sending}
          />
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleSend} disabled={sending || loading}>
            {sending ? <><SpinnerIcon width={15} height={15} /> Sending…</> : <><MailIcon width={15} height={15} /> Send invoice</>}
          </button>
          <button className="btn btn-secondary" onClick={() => onClose(false)} disabled={sending}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
