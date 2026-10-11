import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { quotationsApi, settingsApi } from '../../api/endpoints';
import { openViaApi } from '../../api/download';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { DownloadIcon, EditIcon, PrinterIcon, SpinnerIcon } from '../../components/common/Icons';
import logoImg from '../../assets/logo.png';
import { formatDateDMY } from '../../utils/date';
import {
  lineTotal,
  resolveSections,
  resolveVisibility,
  toLines,
  visibleItems,
  visibleTotal,
} from '../../utils/quotationSections';

const PURPLE = '#6d2475';
const INK = '#343a40';
const MUTED = '#717684';
const money = (value) => Number(value || 0).toFixed(2);

/**
 * Quotation document, laid out like the invoice PDF: logo and number header,
 * From / To, line-items table with a purple header, total, then the quotation
 * sections. Hidden items and hidden sections are left out, exactly as in the PDF.
 */
export default function QuotationView() {
  const { id } = useParams();
  const toast = useToast();
  const can = usePermissions();

  const [quotation, setQuotation] = useState(null);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const companyName = company.company_name || 'Permit Declaration';
  const items = visibleItems(quotation.items);
  const vis = resolveVisibility(quotation);
  const sections = resolveSections(quotation, {
    currency,
    companyName,
    email: company.email || 'Ops@permitdeclaration.sg',
    contact: company.mobile || company.tel || company.contact_no || '',
  });
  const total = visibleTotal(quotation.items);
  const showDescription = vis.description;

  const fromLines = [
    company.address,
    [company.tel ? `Tel: ${company.tel}` : null, company.mobile ? `HP: ${company.mobile}` : null].filter(Boolean).join(' | '),
    company.email ? `Email: ${company.email}` : null,
    company.website,
    company.contact_no ? `Contact: ${company.contact_no}` : null,
  ].filter(Boolean);

  const th = { background: PURPLE, color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' };
  const td = { padding: '9px 10px', borderBottom: `1px solid ${PURPLE}`, fontSize: 13, verticalAlign: 'top' };
  const sectionTitle = { fontWeight: 700, fontSize: 13.5, margin: '16px 0 6px' };
  const para = { margin: '0 0 4px', fontSize: 13 };

  const renderSection = (shown, title, lines) => (
    shown && lines.length ? (
      <div>
        <div style={sectionTitle}>{title}</div>
        {lines.map((line, i) => <p key={i} style={para}>{line}</p>)}
      </div>
    ) : null
  );

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Action bar */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', maxWidth: 860, margin: '0 auto 12px', gap: 10 }}>
        <Link to="/estimates" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 14, fontWeight: 500, marginRight: 'auto' }}>← Back to list</Link>
        {can('quotations.edit') && (
          <Link to={`/estimates/${quotation.id}/edit`} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}>
            <EditIcon size={14} /> Edit
          </Link>
        )}
        <button type="button" onClick={handlePrint} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}>
          <PrinterIcon size={14} /> Print
        </button>
        {can('quotations.print') && (
          <button type="button" onClick={handleDownloadPdf} className="btn btn-primary" disabled={downloading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700 }}>
            {downloading ? <SpinnerIcon size={15} /> : <DownloadIcon size={15} />} Download as PDF
          </button>
        )}
      </div>

      {/* ===== QUOTATION DOCUMENT (invoice layout) ===== */}
      <div className="quotation-document-sheet" style={{
        maxWidth: 860, margin: '0 auto', background: '#fff', color: INK,
        padding: '44px 48px 52px', boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
        borderRadius: 2, fontSize: 13.5, lineHeight: 1.5,
      }}>

        {/* HEADER: logo left, Date + Quotation # right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <img src={logoImg} alt={companyName} style={{ width: 170, height: 'auto', display: 'block' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Date : {formatDateDMY(quotation.quotation_date || quotation.created_at)}</div>
            <div style={{ fontSize: 16.5, fontWeight: 700, marginTop: 3 }}>Quotation #{quotation.quotation_no}</div>
          </div>
        </div>

        {/* FROM / TO */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, marginBottom: 18, fontSize: 12.5 }}>
          <div>
            <div>From:</div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: '4px 0 2px' }}>{companyName}</div>
            {fromLines.map((line, i) => <div key={i} style={{ whiteSpace: 'pre-line' }}>{line}</div>)}
          </div>
          <div>
            <div style={{ margin: '0 0 2px' }}>To: <strong style={{ fontWeight: 700, fontSize: 14 }}>{quotation.companyname || ''}</strong></div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: '4px 0 2px' }}>Name: {quotation.person_incharge || ''}</div>
            <div style={{ whiteSpace: 'pre-line' }}>Address: {quotation.address || ''}</div>
            <div>Phone: {quotation.customer_contact || quotation.mobile_no || ''}</div>
          </div>
        </div>

        {/* DOCUMENT TITLE (optional) */}
        {vis.doc_title && String(sections.doc_title || '').trim() && (
          <h2 style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, margin: '6px 0 14px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {sections.doc_title}
          </h2>
        )}

        {/* LINE ITEMS */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'center', width: 36 }}>#</th>
              <th style={th}>product name</th>
              {showDescription && <th style={th}>Description</th>}
              <th style={{ ...th, textAlign: 'right' }}>Unit Cost {currency}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={showDescription ? 4 : 3} style={{ ...td, textAlign: 'center', color: MUTED }}>No items listed.</td>
              </tr>
            ) : items.map((it, idx) => (
              <tr key={idx}>
                <td style={{ ...td, textAlign: 'center' }}>{idx + 1}</td>
                <td style={{ ...td, textTransform: 'uppercase' }}>{it.productname || '—'}</td>
                {showDescription && <td style={{ ...td, whiteSpace: 'pre-line' }}>{it.description || ''}</td>}
                <td style={{ ...td, textAlign: 'right' }}>{money(it.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* SECTIONS */}
        <div style={{ marginTop: 12 }}>
          {renderSection(vis.item_cost, 'Item Cost :', toLines(sections.item_cost))}

          {vis.turnaround && sections.turnaround.length > 0 && (
            <div>
              <div style={{ ...sectionTitle, textAlign: 'center' }}>PERMIT TURN-AROUND TIME</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: '55%' }}>Priority</th>
                    <th style={{ ...th, textAlign: 'center' }}>Permit Returning Timings</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.turnaround.map((row, i) => (
                    <tr key={i}>
                      <td style={td}>{row.priority}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{row.timing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {renderSection(vis.procedures, 'Procedures :', toLines(sections.procedures))}
          {renderSection(vis.operating_hours, 'Operating Hours :', toLines(sections.operating_hours))}

          {vis.terms && sections.terms.length > 0 && (
            <div>
              <div style={sectionTitle}>Terms &amp; Conditions :</div>
              {sections.terms.map((t, i) => (
                <p key={i} style={{ ...para, paddingLeft: 12 }}>•&nbsp; {t}</p>
              ))}
            </div>
          )}

          {vis.closing_note && String(sections.closing_note || '').trim() && (
            <p style={{ ...para, marginTop: 10 }}>{sections.closing_note}</p>
          )}

          {renderSection(vis.notes, 'Additional Notes :', toLines(quotation.notes))}
        </div>

        <div style={{ marginTop: 34, textAlign: 'center', fontSize: 12.5, fontStyle: 'italic', fontWeight: 700 }}>
          This is a system generated quotation, no authorized signature needed.
        </div>
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
          .quotation-document-sheet th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
