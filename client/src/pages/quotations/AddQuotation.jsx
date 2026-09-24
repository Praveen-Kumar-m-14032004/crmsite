import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { customersApi, quotationsApi, settingsApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import SearchableSelect from '../../components/common/SearchableSelect';
import { PlusIcon, SpinnerIcon, TrashIcon } from '../../components/common/Icons';

const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_RATES = [
  { type: 'EXPORT PERMITS', charge: '11.00 SGD' },
  { type: 'IMPORT PERMITS', charge: '11.00 SGD' },
  { type: 'IMPORTER OF THE RECORD', charge: '30.00 SGD' },
  { type: 'USING PERMIT DECLARATION SFA LICENSE', charge: '25.00 SGD' },
  { type: 'CERTIFICATE OF ORIGINS', charge: '50.00 SGD' },
  { type: 'PERMIT AMENDMENTS', charge: '0.50 SGD' },
  { type: 'CANCELLATION/REJECTION', charge: '0.50 SGD' },
];

const DEFAULT_TURNAROUNDS = [
  { priority: 'Normal Requests', timing: 'Within 2hrs from time of Request' },
  { priority: 'Urgent Requests', timing: 'Within 60mins of Request' },
  { priority: 'Super Urgent Requests', timing: 'Within 30 mins of Request' },
  { priority: 'Tier1/Control countries/Other Controlling Agencies', timing: 'Depending upon the Customs queue' },
];

export default function AddQuotation() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [quotationNo, setQuotationNo] = useState('');
  const [quotationDate, setQuotationDate] = useState(today());
  const [customerId, setCustomerId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [personIncharge, setPersonIncharge] = useState('');
  const [mobileNo, setMobileNo] = useState('');

  const [items, setItems] = useState(DEFAULT_RATES);
  const [turnarounds, setTurnarounds] = useState(DEFAULT_TURNAROUNDS);

  const [opsEmail, setOpsEmail] = useState('Ops@aula.com.sg');
  const [ccEmail, setCcEmail] = useState('Customspermit.sg@gmail.com');
  const [contactNumbers, setContactNumbers] = useState('+65 8370 1443 & +65 8919 7865 / +65 8322 5509');

  useEffect(() => {
    let alive = true;
    Promise.all([
      customersApi.list({ limit: 1000 }),
      settingsApi.get().catch(() => ({ data: {} })),
      isEdit ? quotationsApi.get(id) : quotationsApi.nextNumber(),
    ])
      .then(([cRes, sRes, qRes]) => {
        if (!alive) return;
        setCustomers(cRes.data.data || []);
        if (sRes.data?.email) {
          setOpsEmail(sRes.data.email);
        }

        if (isEdit) {
          const q = qRes.data;
          setQuotationNo(q.quotation_no || '');
          setQuotationDate(q.quotation_date ? q.quotation_date.slice(0, 10) : today());
          setCustomerId(q.customer_id ? String(q.customer_id) : '');
          setCompanyName(q.companyname || '');
          setAddress(q.address || '');
          setPersonIncharge(q.person_incharge || '');
          setMobileNo(q.mobile_no || '');
          if (Array.isArray(q.items) && q.items.length) setItems(q.items);
          if (Array.isArray(q.turnarounds) && q.turnarounds.length) setTurnarounds(q.turnarounds);
          if (q.ops_email) setOpsEmail(q.ops_email);
          if (q.cc_email) setCcEmail(q.cc_email);
          if (q.contact_numbers) setContactNumbers(q.contact_numbers);
        } else {
          setQuotationNo(qRes.data.quotation_no || '');
        }
      })
      .catch((err) => toast.error(errorMessage(err, 'Could not load quotation details')))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id, isEdit]);

  const handleCustomerSelect = (val) => {
    setCustomerId(val);
    const selected = customers.find((c) => String(c.id) === String(val) || c.companyname === val);
    if (selected) {
      setCompanyName(selected.companyname || '');
      setAddress(selected.address || '');
      setPersonIncharge(selected.person_incharge || '');
      setMobileNo(selected.mobile_no || '');
    } else {
      setCompanyName(val);
    }
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addItemRow = () => {
    setItems((prev) => [...prev, { type: '', charge: '0.00 SGD' }]);
  };

  const removeItemRow = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error('Please specify Company Name');
      return;
    }

    setSaving(true);
    const payload = {
      quotation_no: quotationNo,
      customer_id: customerId || null,
      companyname: companyName.trim(),
      address: address.trim(),
      person_incharge: personIncharge.trim(),
      mobile_no: mobileNo.trim(),
      quotation_date: quotationDate,
      items,
      turnarounds,
      ops_email: opsEmail.trim(),
      cc_email: ccEmail.trim(),
      contact_numbers: contactNumbers.trim(),
    };

    try {
      if (isEdit) {
        await quotationsApi.update(id, payload);
        toast.success(`Quotation ${quotationNo} updated`);
        navigate(`/estimates/${id}`);
      } else {
        const res = await quotationsApi.create(payload);
        toast.success(`Quotation ${res.data.quotation_no} created`);
        navigate(`/estimates/${res.data.id}`);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save quotation'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)' }}>
        <SpinnerIcon size={30} />
        <div style={{ marginTop: 10 }}>Loading form...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 60 }}>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow">
            <Link to="/estimates" style={{ color: 'inherit', textDecoration: 'none' }}>
              Estimates / Quotation
            </Link>
          </div>
          <h1>{isEdit ? 'Edit Quotation' : 'Add Official Quotation'}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Customer & Quote Header Details */}
        <div className="card" style={{ padding: 28, marginBottom: 24, borderRadius: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 18, color: 'var(--purple-brand)' }}>
            Header &amp; Client Information
          </h3>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="quotation-no">Quotation Number <span className="req">*</span></label>
              <input
                id="quotation-no"
                value={quotationNo}
                onChange={(e) => setQuotationNo(e.target.value)}
                placeholder="PD-0926-0001"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="quotation-date">Date <span className="req">*</span></label>
              <input
                id="quotation-date"
                type="date"
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
                required
              />
            </div>

            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="customer-select">Select Customer</label>
              <SearchableSelect
                id="customer-select"
                value={customerId}
                onChange={handleCustomerSelect}
                options={customers.map((c) => ({
                  value: String(c.id),
                  label: `${c.companyname} ${c.person_incharge ? `(${c.person_incharge})` : ''}`,
                }))}
                placeholder="Search existing customer or enter custom details below"
              />
            </div>

            <div className="form-field">
              <label htmlFor="company-name">Company Name <span className="req">*</span></label>
              <input
                id="company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. DJCARGO"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="person-incharge">Person In-Charge</label>
              <input
                id="person-incharge"
                value={personIncharge}
                onChange={(e) => setPersonIncharge(e.target.value)}
                placeholder="e.g. Person In-Charge / Contact Person"
              />
            </div>

            <div className="form-field">
              <label htmlFor="mobile-no">Telephone / Phone Number</label>
              <input
                id="mobile-no"
                value={mobileNo}
                onChange={(e) => setMobileNo(e.target.value)}
                placeholder="e.g. +65 88359180"
              />
            </div>

            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="address">Address</label>
              <input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 71 WOODLANDS INDUSTRIAL PARK E9 #01-19 SINGAPORE 757048"
              />
            </div>
          </div>
        </div>

        {/* Permit Types & Charges Table */}
        <div className="card" style={{ padding: 28, marginBottom: 24, borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--purple-brand)' }}>
                Official Quotation Charges
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                Pre-configured with standard Singapore Permit Declaration services. You can adjust prices or add lines.
              </p>
            </div>
            <button
              type="button"
              onClick={addItemRow}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <PlusIcon size={14} /> Add Line Item
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: '8px 10px', width: '65%' }}>PERMIT TYPE / SERVICE</th>
                <th style={{ padding: '8px 10px', width: '25%' }}>PERMIT CHARGES</th>
                <th style={{ padding: '8px 10px', width: '10%', textAlign: 'center' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <input
                      value={it.type}
                      onChange={(e) => handleItemChange(idx, 'type', e.target.value)}
                      placeholder="Permit Type description"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        fontSize: 13,
                      }}
                      required
                    />
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <input
                      value={it.charge}
                      onChange={(e) => handleItemChange(idx, 'charge', e.target.value)}
                      placeholder="e.g. 11.00 SGD"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        fontSize: 13,
                        textAlign: 'center',
                      }}
                      required
                    />
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      disabled={items.length <= 1}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: items.length <= 1 ? '#cbd5e1' : '#ef4444',
                        cursor: items.length <= 1 ? 'not-allowed' : 'pointer',
                        padding: 4,
                      }}
                      title="Remove row"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Ops & Operations Details */}
        <div className="card" style={{ padding: 28, marginBottom: 28, borderRadius: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--purple-brand)' }}>
            Operations Contact &amp; Hotline Information
          </h3>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="ops-email">Ops Team Email</label>
              <input
                id="ops-email"
                value={opsEmail}
                onChange={(e) => setOpsEmail(e.target.value)}
                placeholder="Ops@aula.com.sg"
              />
            </div>

            <div className="form-field">
              <label htmlFor="cc-email">CC Email</label>
              <input
                id="cc-email"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="Customspermit.sg@gmail.com"
              />
            </div>

            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="contacts">24/7 Assistance WhatsApp / Contact</label>
              <input
                id="contacts"
                value={contactNumbers}
                onChange={(e) => setContactNumbers(e.target.value)}
                placeholder="+65 8370 1443 & +65 8919 7865 / +65 8322 5509"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Link to="/estimates" className="btn btn-secondary" style={{ padding: '10px 22px' }}>
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
            style={{
              padding: '10px 26px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 600,
            }}
          >
            {saving && <SpinnerIcon size={16} />}
            {isEdit ? 'Update Quotation' : 'Create Quotation'}
          </button>
        </div>
      </form>
    </div>
  );
}
