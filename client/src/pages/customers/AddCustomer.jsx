import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { customersApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { SpinnerIcon } from '../../components/common/Icons';

const emptyForm = { companyname: '', person_incharge: '', mobile_no: '', email: '', address: '' };

export default function AddCustomer() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    customersApi.get(id)
      .then((res) => setForm({ ...emptyForm, ...res.data }))
      .catch((err) => toast.error(errorMessage(err, 'Could not load this customer')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await customersApi.update(id, form);
        toast.success('Customer updated');
      } else {
        await customersApi.create(form);
        toast.success('Customer added');
      }
      navigate('/customers');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this customer'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Customer Details</div>
          <h1>{isEdit ? 'Edit Customer' : 'Add Customer'}</h1>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/customers')}>
          Back to list
        </button>
      </div>

      <div className="card" style={{ maxWidth: 940 }}>
        {loading ? (
          <div style={{ display: 'grid', gap: 16 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 42 }} />)}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="companyname">Company Name <span className="req">*</span></label>
                <input id="companyname" value={form.companyname} onChange={set('companyname')}
                  placeholder="e.g. Centric Forwarding Pte Ltd" required />
              </div>
              <div className="form-field">
                <label htmlFor="person">Person Incharge</label>
                <input id="person" value={form.person_incharge || ''} onChange={set('person_incharge')}
                  placeholder="e.g. Mr Noi" />
              </div>
              <div className="form-field">
                <label htmlFor="mobile">Mobile No</label>
                <input id="mobile" value={form.mobile_no || ''} onChange={set('mobile_no')}
                  placeholder="+65 9127 6307" />
              </div>
              <div className="form-field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={form.email || ''} onChange={set('email')}
                  placeholder="name@company.com" />
              </div>
            </div>

            <div className="form-field" style={{ marginTop: 18 }}>
              <label htmlFor="address">Address</label>
              <textarea id="address" rows={3} value={form.address || ''} onChange={set('address')}
                placeholder="Street, unit, postal code" />
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? <><SpinnerIcon width={15} height={15} /> Saving…</> : isEdit ? 'Save changes' : 'Submit'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => navigate('/customers')}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
