import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { quotationsApi, settingsApi } from '../../api/endpoints';
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

  const handleDownloadPdf = () => {
    window.open(quotationsApi.pdfUrl(id), '_blank');
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)' }}>
        <SpinnerIcon size={32} />
        <div style={{ marginTop: 12, fontSize: 15 }}>Loading official quotation...</div>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <h3>Quotation Not Found</h3>
        <p style={{ color: 'var(--muted)', marginTop: 8 }}>The requested quotation does not exist or has been removed.</p>
        <Link to="/estimates" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>
          Back to Quotations
        </Link>
      </div>
    );
  }

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

  const quoteDate = quotation.quotation_date
    ? formatDateDMY(quotation.quotation_date)
    : formatDateDMY(quotation.created_at || new Date());

  const opsEmail = quotation.ops_email || company.email || 'Ops@aula.com.sg';
  const ccEmail = quotation.cc_email || 'Customspermit.sg@gmail.com';
  const contacts = quotation.contact_numbers || '+65 8370 1443 & +65 8919 7865 / +65 8322 5509';

  return (
    <div className="quotation-view-wrapper" style={{ paddingBottom: 60 }}>
      {/* Top Floating Action Bar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: 860,
          margin: '0 auto 20px',
          padding: '0 4px',
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
          ← Back to Quotations
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            to={`/estimates/${quotation.id}/edit`}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
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
              padding: '8px 14px',
              fontSize: 13,
            }}
          >
            <PrinterIcon size={14} />
            Print
          </button>

          {/* Floating Navy Blue "Download as PDF" button matching target reference */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#104780',
              color: '#ffffff',
              border: 'none',
              padding: '9px 18px',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13.5,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16, 71, 128, 0.3)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0c3866')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#104780')}
          >
            <DownloadIcon size={16} />
            Download as PDF
          </button>
        </div>
      </div>

      {/* Official Quotation Document Container (Exact Layout & Alignment) */}
      <div
        className="quotation-document-sheet"
        style={{
          maxWidth: 860,
          margin: '0 auto',
          background: '#ffffff',
          color: '#222222',
          padding: '40px 48px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
          borderRadius: 8,
          fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
          fontSize: 13,
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      >
        {/* Header: Logo on Left, Date & Quotation No on Right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <img
              src={logoImg}
              alt="Permit Declaration"
              style={{
                width: 175,
                height: 'auto',
                display: 'block',
              }}
            />
          </div>
          <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#111827' }}>
            <div>DATE : {quoteDate}</div>
            <div style={{ marginTop: 4 }}>Quotaion No : {quotation.quotation_no}</div>
          </div>
        </div>

        {/* Customer Details */}
        <div style={{ marginBottom: 22, fontSize: 13, color: '#111827' }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{quotation.companyname}</div>
          <div style={{ marginTop: 2 }}>Address : {quotation.address || '—'}</div>
          <div style={{ marginTop: 2 }}>Person Incharge : {quotation.person_incharge || '—'}</div>
          <div style={{ marginTop: 2 }}>Tele : {quotation.mobile_no || '—'}</div>
        </div>

        {/* Document Title: Centered & Bold Uppercase */}
        <div
          style={{
            textAlign: 'center',
            fontWeight: 800,
            fontSize: 13.5,
            letterSpacing: '0.04em',
            margin: '20px 0 12px',
            color: '#111827',
          }}
        >
          OFFICIAL QUOTATION FOR PERMIT DECLARATIONS
        </div>

        {/* Table 1: Permit Types & Permit Charges */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #333333',
            fontSize: 12.5,
            marginBottom: 10,
          }}
        >
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid #333333' }}>
              <th
                style={{
                  borderRight: '1px solid #333333',
                  padding: '6px 12px',
                  fontWeight: 800,
                  textAlign: 'center',
                  width: '68%',
                  color: '#111827',
                }}
              >
                PERMIT TYPES
              </th>
              <th
                style={{
                  padding: '6px 12px',
                  fontWeight: 800,
                  textAlign: 'center',
                  width: '32%',
                  color: '#111827',
                }}
              >
                PERMIT CHARGES
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #333333' }}>
                <td
                  style={{
                    borderRight: '1px solid #333333',
                    padding: '5px 12px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                  }}
                >
                  {it.type || it.productname}
                </td>
                <td
                  style={{
                    padding: '5px 12px',
                    textAlign: 'center',
                    fontWeight: 500,
                  }}
                >
                  {it.charge || `${Number(it.rate || 0).toFixed(2)} SGD`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Item Cost Note */}
        <div style={{ marginBottom: 18, fontSize: 12.5, color: '#111827' }}>
          <div style={{ fontWeight: 800 }}>Item Cost :</div>
          <div style={{ marginTop: 2 }}>
            1st to 10th items <strong>No Charges</strong>
          </div>
          <div style={{ marginTop: 2 }}>
            From 11th items onwards additional charge <strong>SGD 0.50 Cents per line item</strong>
          </div>
        </div>

        {/* Turnaround Time Heading */}
        <div
          style={{
            textAlign: 'center',
            fontWeight: 800,
            fontSize: 13,
            margin: '16px 0 10px',
            color: '#111827',
          }}
        >
          (PERMIT TURN-AROUND TIME)
        </div>

        {/* Table 2: Priority & Timings */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #333333',
            fontSize: 12.5,
            marginBottom: 18,
          }}
        >
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid #333333' }}>
              <th
                style={{
                  borderRight: '1px solid #333333',
                  padding: '6px 12px',
                  fontWeight: 800,
                  textAlign: 'center',
                  width: '45%',
                  color: '#111827',
                }}
              >
                Priority :
              </th>
              <th
                style={{
                  padding: '6px 12px',
                  fontWeight: 800,
                  textAlign: 'center',
                  width: '55%',
                  color: '#111827',
                }}
              >
                Permit Returning Timings :
              </th>
            </tr>
          </thead>
          <tbody>
            {turnarounds.map((t, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #333333' }}>
                <td style={{ borderRight: '1px solid #333333', padding: '5px 12px' }}>{t.priority}</td>
                <td style={{ padding: '5px 12px', textAlign: 'center' }}>{t.timing}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Procedures */}
        <div style={{ marginBottom: 16, fontSize: 12.5, color: '#111827' }}>
          <div style={{ fontWeight: 800 }}>Procedures :</div>
          <div style={{ marginTop: 2 }}>To facilitate the customs permit application, kindly provide the following documents:</div>
          <div style={{ marginTop: 2, paddingLeft: 8 }}>
            . BL COPY / AWB COPY / Commercial Invoice / Packing List / NOA / BKG Form
          </div>
          <div style={{ marginTop: 3 }}>
            <strong>Send Your Permit Request To Our Ops Team :</strong> <strong>Email: {opsEmail} | CC: {ccEmail}</strong>
          </div>
          <div style={{ marginTop: 2 }}>
            Upon receipt of the required documents, our ops team will process your permit application promptly. Approved
            permit(s) will be forwarded to your email upon successful approval by Singapore Customs.
          </div>
        </div>

        {/* Operating Hours */}
        <div style={{ marginBottom: 16, fontSize: 12.5, color: '#111827' }}>
          <div style={{ fontWeight: 800 }}>Operating Hours :</div>
          <div style={{ marginTop: 2 }}>
            24 Hours | 7 Days a Week | Including Public Holidays at <strong>NO EXTRA COST</strong>
          </div>
          <div style={{ marginTop: 2 }}>
            We provide 24/7 Customs Permit Declaration Services to support your import and export operations at any time.
          </div>
          <div style={{ marginTop: 3 }}>
            <strong>24/7 Assistance WhatsApp / Contact: {contacts}</strong>
          </div>
          <div style={{ marginTop: 3 }}>
            <strong>Express Permit Processing : Additional SGD 10.00 per permit.</strong>
          </div>
        </div>

        {/* Terms & Conditions */}
        <div style={{ marginBottom: 30, fontSize: 12, color: '#111827' }}>
          <div style={{ fontWeight: 800, fontSize: 12.5 }}>Terms &amp; Conditions :</div>
          <div style={{ marginTop: 3, paddingLeft: 8 }}>
            . Payment for Declaration services shall be made within 7 days from the invoice date.
          </div>
          <div style={{ marginTop: 2, paddingLeft: 8 }}>
            . Under our GIRO arrangement with Singapore Customs, all applicable GST, Customs Duties, and Government
            charges are deducted directly from our company's GIRO account.
          </div>
          <div style={{ marginTop: 2, paddingLeft: 8 }}>
            . Customers are required to transfer the applicable GST and DUTY charges to our company's designated UOB bank
            account before permit submission and approval.
          </div>
          <div style={{ marginTop: 2, paddingLeft: 8 }}>
            . Permit application will be processed for approval only after the GST payment has been received.
          </div>
          <div style={{ marginTop: 2, paddingLeft: 8 }}>
            . Additional charges may apply for permit amendments, cancellations, controlled goods, licence applications, or
            other special customs requirements.
          </div>
          <div style={{ marginTop: 2, paddingLeft: 8 }}>
            . Unless otherwise stated, this quotation is valid for 10 days from the date of issue.
          </div>
          <div style={{ marginTop: 6 }}>
            Thank you for choosing Permit Declaration Services. We look forward to serving you with fast, reliable, and
            professional support 24/7.
          </div>
        </div>

        {/* Sign-off Block (Clean without specific CEO name per instructions) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, textAlign: 'right' }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ fontWeight: 800, fontSize: 12.5, letterSpacing: '0.03em' }}>THANKS &amp; BEST REGARDS</div>
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600 }}>YOURS FAITHFULLY</div>
            <div
              style={{
                marginTop: 36,
                borderBottom: '1px dotted #888888',
                width: 220,
                marginLeft: 'auto',
              }}
            />
            <div style={{ marginTop: 4, fontWeight: 800, fontSize: 12 }}>(AUTHORISED SIGNATURE)</div>
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
