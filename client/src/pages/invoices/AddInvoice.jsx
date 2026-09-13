import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { customersApi, invoicesApi, productsApi, settingsApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { toDateInputValue } from '../../utils/date';
import { PlusIcon, SpinnerIcon, TrashIcon } from '../../components/common/Icons';

const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = () => ({ product_id: '', description: '', rate: '', quantity: 1 });

const PAYMENT_TYPES = ['Cash', 'Bank Transfer', 'Cheque', 'UPI'];
const PAYMENT_STATUSES = ['Full Payment', 'Partial Payment', 'Due'];

export default function AddInvoice() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('SGD');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [customerId, setCustomerId] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [items, setItems] = useState([emptyItem()]);
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentType, setPaymentType] = useState('Cash');
  const [paymentStatus, setPaymentStatus] = useState('Due');
  const [statusTouched, setStatusTouched] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState('Pending');
  // Version of the record this form was loaded from, sent back on save so the
  // server can reject an edit that would clobber someone else's newer changes.
  const [loadedVersion, setLoadedVersion] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      customersApi.list({ limit: 1000 }),
      productsApi.list({ limit: 1000 }),
      settingsApi.get().catch(() => ({ data: {} })),
      isEdit ? invoicesApi.get(id) : invoicesApi.nextNumber(),
    ])
      .then(([cRes, pRes, sRes, last]) => {
        if (!alive) return;
        setCustomers(cRes.data.data);
        setProducts(pRes.data.data);
        setCurrency(sRes.data?.default_currency || 'SGD');

        if (isEdit) {
          const inv = last.data;
          setInvoiceNo(inv.invoice_no);
          setInvoiceDate(toDateInputValue(inv.invoice_date));
          setCustomerId(String(inv.customer_id));
          setCustomerContact(inv.customer_contact || '');
          setPaidAmount(String(inv.paid_amount ?? ''));
          setPaymentType(inv.payment_type || 'Cash');
          setPaymentStatus(inv.payment_status || 'Due');
          setInvoiceStatus(inv.status || 'Pending');
          setLoadedVersion(inv.version ?? null);
          setStatusTouched(true);
          setItems(inv.items.length ? inv.items.map((it) => ({
            product_id: String(it.product_id),
            description: it.description || '',
            rate: String(it.rate),
            quantity: String(Number(it.quantity)),
          })) : [emptyItem()]);
        } else {
          setInvoiceNo(last.data.invoice_no);
        }
      })
      .catch((err) => setError(errorMessage(err, 'Could not load invoice data')))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const subAmount = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.rate) || 0) * (Number(it.quantity) || 0), 0),
    [items]
  );
  const paid = Number(paidAmount) || 0;
  const dueAmount = Math.max(subAmount - paid, 0);

  // Suggest the payment status from the numbers until the user picks one themselves.
  useEffect(() => {
    if (statusTouched) return;
    if (subAmount > 0 && paid >= subAmount) setPaymentStatus('Full Payment');
    else if (paid > 0) setPaymentStatus('Partial Payment');
    else setPaymentStatus('Due');
  }, [subAmount, paid, statusTouched]);

  const handleCustomerChange = (e) => {
    const value = e.target.value;
    setCustomerId(value);
    const cust = customers.find((c) => String(c.id) === value);
    setCustomerContact(cust?.mobile_no || '');
  };

  const updateItem = (idx, field, value) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

  const addRow = () => setItems((prev) => [...prev, emptyItem()]);
  const removeRow = (idx) => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const resetForm = () => {
    setCustomerId('');
    setCustomerContact('');
    setItems([emptyItem()]);
    setPaidAmount('');
    setPaymentType('Cash');
    setStatusTouched(false);
    setInvoiceDate(today());
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!customerId) { setError('Please select a company.'); return; }
    if (items.some((it) => !it.product_id)) { setError('Every line item needs a product selected.'); return; }
    if (items.some((it) => it.rate === '' || Number(it.rate) < 0)) { setError('Every line item needs a valid rate.'); return; }
    if (items.some((it) => !Number(it.quantity) || Number(it.quantity) <= 0)) { setError('Quantity must be greater than zero.'); return; }
    if (paid > subAmount) { setError('Paid amount cannot be more than the sub amount.'); return; }

    setSaving(true);
    const payload = {
      invoice_no: invoiceNo.trim(),
      invoice_date: invoiceDate,
      customer_id: Number(customerId),
      customer_contact: customerContact,
      items: items.map((it) => ({
        product_id: Number(it.product_id),
        description: it.description,
        rate: Number(it.rate),
        quantity: Number(it.quantity),
      })),
      paid_amount: paid,
      payment_type: paymentType,
      payment_status: paymentStatus,
      // Preserve the stored workflow status when editing; new invoices start Pending.
      status: isEdit ? invoiceStatus : 'Pending',
      ...(isEdit && loadedVersion !== null ? { expected_version: loadedVersion } : {}),
    };

    try {
      if (isEdit) {
        await invoicesApi.update(id, payload);
        toast.success(`Invoice #${payload.invoice_no} updated`);
      } else {
        await invoicesApi.create(payload);
        toast.success(`Invoice #${payload.invoice_no} created`);
      }
      navigate('/invoices');
    } catch (err) {
      const msg = errorMessage(err, 'Could not save this invoice');
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1>{isEdit ? 'Edit Invoice' : 'Add Invoice'}</h1></div>
        <div className="card" style={{ display: 'grid', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Invoice</div>
          <h1>{isEdit ? `Edit Invoice #${invoiceNo}` : 'Add Invoice'}</h1>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/invoices')}>Back to list</button>
      </div>

      {error && <div className="login-error" style={{ marginBottom: 18 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-head" style={{ marginBottom: 18 }}>
            <div>
              <div className="card-title">Invoice details</div>
              <div className="card-sub">Who this invoice is for and when it was raised</div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="invno">Invoice No <span className="req">*</span></label>
              <input id="invno" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required />
            </div>
            <div className="form-field">
              <label htmlFor="invdate">Invoice Date <span className="req">*</span></label>
              <input id="invdate" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
            </div>
            <div className="form-field">
              <label htmlFor="company">Company Name <span className="req">*</span></label>
              <select id="company" value={customerId} onChange={handleCustomerChange} required>
                <option value="">Select company…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.companyname}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="contact">Customer Contact No.</label>
              <input id="contact" value={customerContact} onChange={(e) => setCustomerContact(e.target.value)}
                placeholder="Auto-filled from customer" />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-title">Line items</div>
              <div className="card-sub">Totals update as you type</div>
            </div>
            <span className="badge badge-info badge-plain">{items.length} {items.length === 1 ? 'row' : 'rows'}</span>
          </div>

          <div className="line-items table-scroll">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>Product</th>
                  <th>Description</th>
                  <th style={{ width: '13%' }}>Rate</th>
                  <th style={{ width: '11%' }}>Quantity</th>
                  <th style={{ width: '14%' }}>Total ({currency})</th>
                  <th style={{ width: 52 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <select value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)} required>
                        <option value="">Select…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.productname}</option>)}
                      </select>
                    </td>
                    <td>
                      <input value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)}
                        placeholder="Reference / remarks" />
                    </td>
                    <td>
                      <input type="number" step="0.01" min="0" inputMode="decimal" value={item.rate}
                        onChange={(e) => updateItem(idx, 'rate', e.target.value)} placeholder="0.00" required />
                    </td>
                    <td>
                      <input type="number" step="1" min="1" inputMode="numeric" value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)} required />
                    </td>
                    <td>
                      <input readOnly className="num"
                        value={((Number(item.rate) || 0) * (Number(item.quantity) || 0)).toFixed(2)} />
                    </td>
                    <td>
                      <button type="button" className="btn-icon icon-delete" title="Remove row"
                        onClick={() => removeRow(idx)} disabled={items.length === 1}>
                        <TrashIcon width={15} height={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="add-row-btn" onClick={addRow}>
            <PlusIcon width={15} height={15} /> Add line item
          </button>

          <div className="totals-panel">
            <div className="form-field">
              <label>Sub Amount ({currency})</label>
              <input readOnly className="num" value={subAmount.toFixed(2)} />
            </div>
            <div className="form-field">
              <label htmlFor="paid">Paid Amount</label>
              <input id="paid" type="number" step="0.01" min="0" inputMode="decimal" value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-field">
              <label htmlFor="ptype">Payment Type</label>
              <select id="ptype" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                {PAYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="pstatus">Payment Status</label>
              <select id="pstatus" value={paymentStatus}
                onChange={(e) => { setPaymentStatus(e.target.value); setStatusTouched(true); }}>
                {PAYMENT_STATUSES.map((sVal) => <option key={sVal}>{sVal}</option>)}
              </select>
            </div>
            <div className="totals-highlight">
              <span>Due Amount</span>
              <strong className="num">{currency} {dueAmount.toFixed(2)}</strong>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <><SpinnerIcon width={15} height={15} /> Saving…</> : isEdit ? 'Save changes' : 'Submit'}
            </button>
            <button className="btn btn-danger" type="button" onClick={resetForm} disabled={saving}>Reset</button>
          </div>
        </div>
      </form>
    </div>
  );
}
