import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { quotationsApi, settingsApi } from '../../api/endpoints';
import { openViaApi } from '../../api/download';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { DownloadIcon, EditIcon, PrinterIcon, SpinnerIcon } from '../../components/common/Icons';
import logoImg from '../../assets/logo.png';
import { formatDateDMY } from '../../utils/date';

export default function QuotationView() {
  const { id } = useParams();
  const navigate = useNavigate();
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

    return () => {
      alive = false;
    };
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

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
        <Link to="/estimates" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>
          Back to list
        </Link>
      </div>
    );
  }

  const currency = company.default_currency || 'SGD';
  const items = Array.isArray(quotation.items) ? quotation.items : [];
  const subTotal = Number(
    quotation.sub_amount ||
    items.reduce((sum, it) => sum + (Number(it.total) || (Number(it.rate || 0) * Number(it.quantity || 1))), 0)
  );

  const telLine = [
    company.tel ? `Tel: ${company.tel}` : null,
    company.mobile ? `HP: ${company.mobile}` : null,
  ].filter(Boolean).join(' | ');

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Top Action Bar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: 860,
          margin: '0 auto 20px',
        }}
      >
        <Link
          to="/estimates"
          style={{
            color: 'var(--muted)',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ← Back to list
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            to={`/estimates/${quotation.id}/edit`}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              fontSize: 13,
            }}
          >
            <EditIcon size={14} />
            Edit
          </Link>

          <button
            type="button"
            onClick={handlePrint}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              fontSize: 13,
            }}
          >
            <PrinterIcon size={14} />
            Print
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="btn btn-primary"
            disabled={downloading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {downloading ? <SpinnerIcon size={15} /> : <DownloadIcon size={15} />}
            Download PDF
          </button>
        </div>
      </div>

      {/* Official Quotation Document Sheet Matching Website Design */}
      <div
        className="quotation-document-sheet card"
        style={{
          maxWidth: 860,
          margin: '0 auto',
          background: '#ffffff',
          color: 'var(--ink)',
          padding: '48px 52px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)',
          borderRadius: 12,
          fontFamily: 'inherit',
          fontSize: 13.5,
          lineHeight: 1.5,
        }}
      >
        {/* Header: Logo & Company UEN / Quote Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <img
              src={logoImg}
              alt={company.company_name || 'Permit Declaration'}
              style={{
                width: 170,
                height: 'auto',
                display: 'block',
              }}
            />
          </div>
          <div style={{ textAlign: 'right' }}>
            {company.uen && (
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>
                UEN: <strong style={{ color: 'var(--ink)' }}>{company.uen}</strong>
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
              Date: <strong style={{ color: 'var(--ink)' }}>{formatDateDMY(quotation.quotation_date || quotation.created_at)}</strong>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--purple-brand)', letterSpacing: '0.02em' }}>
              Quotation #{quotation.quotation_no}
            </div>
          </div>
        </div>

        {/* From & To Section */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 28,
            marginBottom: 30,
            paddingTop: 16,
            borderTop: '1px solid var(--line)',
          }}
        >
          {/* From */}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--purple-brand)', fontSize: 13, textTransform: 'uppercase', marginBottom: 4 }}>
              From:
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
              {company.company_name || 'Permit Declaration'}
            </div>
            {company.address && (
              <div style={{ color: 'var(--muted)', marginTop: 3, whiteSpace: 'pre-line' }}>{company.address}</div>
            )}
            {telLine && <div style={{ color: 'var(--muted)', marginTop: 2 }}>{telLine}</div>}
            {company.email && <div style={{ color: 'var(--muted)', marginTop: 2 }}>Email: {company.email}</div>}
            {company.website && <div style={{ color: 'var(--muted)', marginTop: 2 }}>{company.website}</div>}
          </div>

          {/* To */}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--purple-brand)', fontSize: 13, textTransform: 'uppercase', marginBottom: 4 }}>
              To:
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
              {quotation.companyname || '—'}
            </div>
            {quotation.person_incharge && (
              <div style={{ color: 'var(--ink)', fontWeight: 500, marginTop: 2 }}>
                Attn: {quotation.person_incharge}
              </div>
            )}
            {quotation.address && (
              <div style={{ color: 'var(--muted)', marginTop: 2, whiteSpace: 'pre-line' }}>
                {quotation.address}
              </div>
            )}
            {(quotation.customer_contact || quotation.mobile_no) && (
              <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                Phone: {quotation.customer_contact || quotation.mobile_no}
              </div>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div style={{ overflowX: 'auto', marginBottom: 24 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ background: 'var(--purple-brand)', color: '#ffffff' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: 40, borderRadius: '6px 0 0 0' }}>#</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', width: '30%' }}>Product Name</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '14%' }}>Unit Cost ({currency})</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: '10%' }}>Qty</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '16%', borderRadius: '0 6px 0 0' }}>
                  Total ({currency})
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)' }}>
                    No items listed on this quotation.
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid var(--line-soft)',
                      background: idx % 2 === 1 ? 'var(--canvas)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{it.productname || it.type || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink-2)', whiteSpace: 'pre-line' }}>
                      {it.description || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {Number(it.rate || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{it.quantity || 1}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                      {Number(it.total || (Number(it.rate || 0) * Number(it.quantity || 1))).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totals & Notes Section */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 28,
            alignItems: 'start',
            marginBottom: 36,
          }}
        >
          <div>
            {quotation.notes && (
              <div
                style={{
                  background: 'var(--canvas)',
                  padding: '14px 16px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: 'var(--ink-2)',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--purple-brand)', marginBottom: 4 }}>Notes / Terms:</div>
                <div style={{ whiteSpace: 'pre-line' }}>{quotation.notes}</div>
              </div>
            )}
          </div>

          <div
            style={{
              background: 'var(--canvas)',
              padding: '16px 20px',
              borderRadius: 8,
              textAlign: 'right',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Total Amount:</span>
              <strong style={{ fontSize: 18, color: 'var(--purple-brand)', fontFamily: 'monospace' }}>
                {currency} {subTotal.toFixed(2)}
              </strong>
            </div>
          </div>
        </div>

        {/* Sign-off Signature Line */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40, textAlign: 'right' }}>
          <div style={{ minWidth: 220 }}>
            <div
              style={{
                borderBottom: '1px dotted #999999',
                width: 200,
                marginLeft: 'auto',
                marginBottom: 6,
              }}
            />
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)' }}>(AUTHORISED SIGNATURE)</div>
          </div>
        </div>
      </div>

      {/* Print Specific Styles */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .sidebar,
          .topbar,
          .no-print {
            display: none !important;
          }
          .app-main {
            margin: 0 !important;
            padding: 0 !important;
          }
          .quotation-document-sheet {
            box-shadow: none !important;
            border: none !important;
            padding: 10mm 15mm !important;
            max-width: 100% !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
