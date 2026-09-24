import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { quotationsApi, settingsApi } from '../../api/endpoints';
import { openViaApi } from '../../api/download';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { DownloadIcon, EditIcon, PrinterIcon, SpinnerIcon } from '../../components/common/Icons';
import logoImg from '../../assets/logo.png';
import { formatDateDMY } from '../../utils/date';

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
  const companyName = company.company_name || 'Permit Declaration';

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* ── Download as PDF button (top-right, floating) ── */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          maxWidth: 860,
          margin: '0 auto 12px',
          gap: 10,
        }}
      >
        <Link
          to="/estimates"
          style={{
            color: 'var(--muted)',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 500,
            marginRight: 'auto',
          }}
        >
          ← Back to list
        </Link>

        <Link
          to={`/estimates/${quotation.id}/edit`}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}
        >
          <EditIcon size={14} />
          Edit
        </Link>

        <button
          type="button"
          onClick={handlePrint}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}
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
            padding: '10px 22px',
            fontSize: 13,
            fontWeight: 700,
            background: '#1b2a4a',
            color: '#ffffff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {downloading ? <SpinnerIcon size={15} /> : <DownloadIcon size={15} />}
          Download as PDF
        </button>
      </div>

      {/* ── Official Quotation Document Sheet ── */}
      <div
        className="quotation-document-sheet"
        style={{
          maxWidth: 860,
          margin: '0 auto',
          background: '#ffffff',
          color: '#1a1a1a',
          padding: '48px 56px 56px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          borderRadius: 2,
          fontFamily: "'Times New Roman', 'Georgia', serif",
          fontSize: 14,
          lineHeight: 1.65,
        }}
      >
        {/* ── HEADER: Logo left | Date & Quotation No right ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <img
              src={logoImg}
              alt={companyName}
              style={{ width: 180, height: 'auto', display: 'block' }}
            />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1b2a4a' }}>
              DATE : {formatDateDMY(quotation.quotation_date || quotation.created_at)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1b2a4a', marginTop: 2 }}>
              Quotation No : {quotation.quotation_no}
            </div>
          </div>
        </div>

        {/* ── CUSTOMER INFO ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>
            {quotation.companyname || '—'}
          </div>
          {quotation.address && (
            <div style={{ fontSize: 14, marginBottom: 8 }}>
              Address : {quotation.address}
            </div>
          )}
          <div style={{ marginBottom: 2 }}>
            <span style={{ fontWeight: 700, minWidth: 160, display: 'inline-block' }}>Person Incharge</span>
            <span> : {quotation.person_incharge || 'Person In-Charge'}</span>
          </div>
          <div>
            <span style={{ fontWeight: 700, minWidth: 160, display: 'inline-block' }}>Tele</span>
            <span style={{ paddingLeft: 62 }}> : {quotation.customer_contact || quotation.mobile_no || '—'}</span>
          </div>
        </div>

        {/* ── TITLE ── */}
        <h2 style={{
          textAlign: 'center',
          fontSize: 16,
          fontWeight: 700,
          color: '#1a1a1a',
          margin: '24px 0 16px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          OFFICIAL QUOTATION FOR PERMIT DECLARATIONS
        </h2>

        {/* ── PERMIT TYPES TABLE ── */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
          marginBottom: 20,
        }}>
          <thead>
            <tr>
              <th style={{
                border: '1px solid #333',
                padding: '10px 14px',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: 14,
                textTransform: 'uppercase',
              }}>
                PERMIT TYPES
              </th>
              <th style={{
                border: '1px solid #333',
                padding: '10px 14px',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: 14,
                textTransform: 'uppercase',
              }}>
                PERMIT CHARGES
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ border: '1px solid #333', padding: '10px 14px', textAlign: 'center', color: '#999' }}>
                  No items listed on this quotation.
                </td>
              </tr>
            ) : (
              items.map((it, idx) => (
                <tr key={idx}>
                  <td style={{
                    border: '1px solid #333',
                    padding: '9px 14px',
                    fontWeight: 400,
                    textTransform: 'uppercase',
                    fontSize: 14,
                  }}>
                    {it.productname || it.type || '—'}
                  </td>
                  <td style={{
                    border: '1px solid #333',
                    padding: '9px 14px',
                    textAlign: 'center',
                    fontSize: 14,
                  }}>
                    {Number(it.rate || it.total || 0).toFixed(2)} {currency}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── ITEM COST ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Item Cost :</div>
          <div style={{ marginBottom: 4 }}>
            1st to 10th items <strong>No Charges</strong>
          </div>
          <div>
            From 11th items onwards additional charge <strong>{currency} 0.50 Cents per line item</strong>
          </div>
        </div>

        {/* ── PERMIT TURN-AROUND TIME ── */}
        <h3 style={{
          textAlign: 'center',
          fontSize: 15,
          fontWeight: 700,
          margin: '28px 0 14px',
        }}>
          (PERMIT TURN-AROUND TIME)
        </h3>

        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
          marginBottom: 28,
        }}>
          <thead>
            <tr>
              <th style={{
                border: '1px solid #333',
                padding: '9px 14px',
                textAlign: 'center',
                fontWeight: 700,
              }}>
                Priority :
              </th>
              <th style={{
                border: '1px solid #333',
                padding: '9px 14px',
                textAlign: 'center',
                fontWeight: 700,
              }}>
                Permit Returning Timings :
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Normal Requests', 'Within 2hrs from time of Request'],
              ['Urgent Requests', 'Within 60mins of Request'],
              ['Super Urgent Requests', 'Within 30 mins of Request'],
              ['Tier1/Control countries/Other Controlling Agencies', 'Depending upon the Customs queue'],
            ].map(([priority, timing], idx) => (
              <tr key={idx}>
                <td style={{ border: '1px solid #333', padding: '9px 14px' }}>{priority}</td>
                <td style={{ border: '1px solid #333', padding: '9px 14px', textAlign: 'center' }}>{timing}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── PROCEDURES ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Procedures :</div>
          <div style={{ marginBottom: 4 }}>
            To facilitate the customs permit application, kindly provide the following documents:
          </div>
          <div style={{ paddingLeft: 16, marginBottom: 6 }}>
            .&nbsp; BL COPY / AWB COPY / Commercial Invoice / Packing List / NOA / BKG Form
          </div>
          <div style={{ marginBottom: 4 }}>
            Send Your Permit Request To Our Ops Team : <strong>Email: {company.email || 'Ops@permitdeclaration.sg'}</strong> | CC: <strong>Customspermit.sg@gmail.com</strong>
          </div>
          <div style={{ marginBottom: 4 }}>
            Upon receipt of the required documents, our ops team will process your permit application promptly. Approved
            permit(s) will be forwarded to your email upon successful approval by Singapore Customs.
          </div>
        </div>

        {/* ── OPERATING HOURS ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Operating Hours :</div>
          <div style={{ marginBottom: 4 }}>
            24 Hours | 7 Days a Week | Including Public Holidays at <strong>NO EXTRA COST</strong>
          </div>
          <div style={{ marginBottom: 4 }}>
            We provide 24/7 Customs Permit Declaration Services to support your import and export operations at any time.
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>24/7 Assistance WhatsApp / Contact: {company.mobile || company.tel || '+65 XXXX XXXX'}</strong>
          </div>
          <div>
            <strong>Express Permit Processing : Additional {currency} 10.00 per permit.</strong>
          </div>
        </div>

        {/* ── TERMS & CONDITIONS ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Terms &amp; Conditions :</div>
          {[
            `Payment for Declaration services shall be made within 7 days from the invoice date.`,
            `Under our GIRO arrangement with Singapore Customs, all applicable GST, Customs Duties, and Government charges are deducted directly from our company's GIRO account.`,
            `Customers are required to transfer the applicable GST and DUTY charges to our company's designated UOB bank account before permit submission and approval.`,
            `Permit application will be processed for approval only after the GST payment has been received.`,
            `Additional charges may apply for permit amendments, cancellations, controlled goods, licence applications, or other special customs requirements.`,
            `Unless otherwise stated, this quotation is valid for 10 days from the date of issue.`,
          ].map((term, idx) => (
            <div key={idx} style={{ paddingLeft: 16, marginBottom: 4 }}>
              .&nbsp; {term}
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            Thank you for choosing {companyName} Permit Declaration Services. We look forward to serving you with fast, reliable,
            and professional support 24/7.
          </div>
        </div>

        {/* ── SIGN-OFF ── */}
        <div style={{ textAlign: 'right', marginTop: 40 }}>
          <div style={{
            fontWeight: 700,
            fontSize: 15,
            color: '#1b2a4a',
            textTransform: 'uppercase',
          }}>
            THANKS &amp; BEST REGARDS
          </div>
          <div style={{
            fontWeight: 700,
            fontSize: 15,
            color: '#1b2a4a',
            textTransform: 'uppercase',
            marginBottom: 40,
          }}>
            GANI - CEO
          </div>
        </div>

        {/* ── SIGNATURE LINE ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <div style={{ textAlign: 'center', minWidth: 240 }}>
            <div style={{
              borderBottom: '1px dotted #666',
              width: 220,
              marginLeft: 'auto',
              marginRight: 'auto',
              marginBottom: 8,
            }} />
            <div style={{ fontWeight: 700, fontSize: 13, color: '#333' }}>
              (AUTHORISED SIGNATURE)
            </div>
          </div>
        </div>

        {/* ── NOTES (if any custom notes were added) ── */}
        {quotation.notes && (
          <div style={{
            marginTop: 28,
            paddingTop: 16,
            borderTop: '1px solid #ddd',
            fontSize: 13,
            color: '#555',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#333' }}>Additional Notes:</div>
            <div style={{ whiteSpace: 'pre-line' }}>{quotation.notes}</div>
          </div>
        )}
      </div>

      {/* ── Print Styles ── */}
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
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
