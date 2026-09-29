import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { quotationsApi, settingsApi } from '../../api/endpoints';
import { openViaApi } from '../../api/download';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { DownloadIcon, EditIcon, PrinterIcon, SpinnerIcon } from '../../components/common/Icons';
import logoImg from '../../assets/logo.png';
import { formatDateDMY } from '../../utils/date';
import { resolveSections, toLines } from '../../utils/quotationSections';

export default function QuotationView() {
  const { id } = useParams();
  const toast = useToast();

  const [quotation, setQuotation] = useState(null);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      quotationsApi.get(id),
      settingsApi.get().catch(() => ({ data: {} })),
    ])
      .then(([qRes, cRes]) => {
        if (!alive) return;
        setQuotation(qRes.data);
        setCompany(cRes.data || {});
      })
      .catch((err) => toast.error(errorMessage(err, 'Failed to load quotation')))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [id]);

  const handlePrint = () => window.print();

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      await openViaApi(`/quotations/${id}/pdf`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate PDF'));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)' }}>
        <SpinnerIcon size={32} />
        <div style={{ marginTop: 12, fontSize: 15 }}>Loading quotation...</div>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <h3>Quotation Not Found</h3>
        <p style={{ color: 'var(--muted)', marginTop: 8 }}>The requested quotation does not exist or has been removed.</p>
        <Link to="/estimates" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>Back to list</Link>
      </div>
    );
  }

  const currency = company.default_currency || 'SGD';
  const items = Array.isArray(quotation.items) ? quotation.items : [];
  const companyName = company.company_name || 'Permit Declaration';
  const sections = resolveSections(quotation, {
    currency,
    companyName,
    email: company.email || 'Ops@permitdeclaration.sg',
    contact: company.mobile || company.tel || company.contact_no || '',
  });
  const TS = { fontFamily: "'Times New Roman', Georgia, serif" };
  const NAVY = '#1b2a4a';

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Action bar */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', maxWidth: 860, margin: '0 auto 12px', gap: 10 }}>
        <Link to="/estimates" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 14, fontWeight: 500, marginRight: 'auto' }}>← Back to list</Link>
        <Link to={`/estimates/${quotation.id}/edit`} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}>
          <EditIcon size={14} /> Edit
        </Link>
        <button type="button" onClick={handlePrint} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}>
          <PrinterIcon size={14} /> Print
        </button>
        <button type="button" onClick={handleDownloadPdf} className="btn btn-primary" disabled={downloading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, background: NAVY, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {downloading ? <SpinnerIcon size={15} /> : <DownloadIcon size={15} />} Download as PDF
        </button>
      </div>

      {/* ===== OFFICIAL QUOTATION DOCUMENT ===== */}
      <div className="quotation-document-sheet" style={{
        maxWidth: 860, margin: '0 auto', background: '#fff', color: '#222',
        padding: '50px 56px 56px', boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
        borderRadius: 2, ...TS, fontSize: 14.5, lineHeight: 1.7,
      }}>

        {/* HEADER: Logo left, Date & Quotation No straight to the right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <img src={logoImg} alt={companyName} style={{ width: 180, height: 'auto', display: 'block' }} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, letterSpacing: 0.2 }}>
              DATE : {formatDateDMY(quotation.quotation_date || quotation.created_at)}
            </div>
            <div style={{ fontSize: 16.5, fontWeight: 700, color: NAVY, marginTop: 4, letterSpacing: 0.2 }}>
              Quotation No : {quotation.quotation_no}
            </div>
          </div>
        </div>

        {/* CUSTOMER INFO */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{quotation.companyname || '—'}</div>
          {quotation.address && (
            <div style={{ marginBottom: 8 }}>
              <strong>Address :</strong> {quotation.address}
            </div>
          )}
          <table style={{ borderCollapse: 'collapse', fontSize: 14.5, ...TS }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12, paddingBottom: 3, whiteSpace: 'nowrap' }}>Person Incharge</td>
                <td style={{ paddingBottom: 3 }}>: {quotation.person_incharge || '—'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Tele</td>
                <td>: {quotation.customer_contact || quotation.mobile_no || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* TITLE */}
        <h2 style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, margin: '28px 0 18px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {sections.doc_title}
        </h2>

        {/* PERMIT TYPES TABLE */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5, marginBottom: 24 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #333', padding: '10px 14px', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' }}>PERMIT TYPES</th>
              <th style={{ border: '1px solid #333', padding: '10px 14px', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' }}>PERMIT CHARGES</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={2} style={{ border: '1px solid #333', padding: '10px 14px', textAlign: 'center', color: '#999' }}>No items listed.</td></tr>
            ) : items.map((it, idx) => (
              <tr key={idx}>
                <td style={{ border: '1px solid #333', padding: '9px 14px', textTransform: 'uppercase' }}>{it.productname || it.type || '—'}</td>
                <td style={{ border: '1px solid #333', padding: '9px 14px', textAlign: 'center' }}>{Number(it.rate || it.total || 0).toFixed(2)} {currency}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ITEM COST */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Item Cost :</div>
          {toLines(sections.item_cost).map((line, i) => (
            <div key={i} style={{ marginBottom: 6 }}>{line}</div>
          ))}
        </div>

        {/* PERMIT TURN-AROUND TIME */}
        <h3 style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, margin: '30px 0 16px' }}>(PERMIT TURN-AROUND TIME)</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5, marginBottom: 30 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #333', padding: '9px 14px', textAlign: 'center', fontWeight: 700 }}>Priority :</th>
              <th style={{ border: '1px solid #333', padding: '9px 14px', textAlign: 'center', fontWeight: 700 }}>Permit Returning Timings :</th>
            </tr>
          </thead>
          <tbody>
            {sections.turnaround.map((row, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #333', padding: '9px 14px' }}>{row.priority}</td>
                <td style={{ border: '1px solid #333', padding: '9px 14px', textAlign: 'center' }}>{row.timing}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* PROCEDURES */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Procedures :</div>
          {toLines(sections.procedures).map((line, i) => (
            <p key={i} style={{ margin: '0 0 6px' }}>{line}</p>
          ))}
        </div>

        {/* OPERATING HOURS */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Operating Hours :</div>
          {toLines(sections.operating_hours).map((line, i) => (
            <p key={i} style={{ margin: '0 0 6px' }}>{line}</p>
          ))}
        </div>

        {/* TERMS & CONDITIONS */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Terms &amp; Conditions :</div>
          {sections.terms.map((t, i) => (
            <p key={i} style={{ margin: '0 0 5px', paddingLeft: 16 }}>.&nbsp; {t}</p>
          ))}
          {sections.closing_note && (
            <p style={{ margin: '10px 0 0' }}>{sections.closing_note}</p>
          )}
        </div>

        {/* NOTES */}
        {quotation.notes && (
          <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #ddd', fontSize: 13, color: '#555' }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#333' }}>Additional Notes:</div>
            <div style={{ whiteSpace: 'pre-line' }}>{quotation.notes}</div>
          </div>
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .sidebar, .topbar, .no-print { display: none !important; }
          .app-main { margin: 0 !important; padding: 0 !important; }
          .quotation-document-sheet {
            box-shadow: none !important; border: none !important;
            padding: 10mm 15mm !important; max-width: 100% !important;
            width: 100% !important; border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
