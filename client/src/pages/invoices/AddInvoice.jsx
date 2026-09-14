import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { customersApi, invoicesApi, productsApi, settingsApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { toDateInputValue } from '../../utils/date';
import { PlusIcon, SpinnerIcon, TrashIcon } from '../../components/common/Icons';
import SearchableSelect from '../../components/common/SearchableSelect';

const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = () => ({ product_id: '', description: '', rate: '', quantity: 1 });
const defaultItems = () => Array.from({ length: 6 }, emptyItem);

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
  const [items, setItems] = useState(defaultItems());
  const [paidAmount, setPaidAmount] = useState('');
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
          setInvoiceStatus(inv.status || 'Pending');
          setLoadedVersion(inv.version ?? null);
          setItems(inv.items.length ? inv.items.map((it) => ({
            product_id: String(it.product_id),
            description: it.description || '',
            rate: String(it.rate),
            quantity: String(Number(it.quantity)),
          })) : defaultItems());
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

  const handleCustomerChange = (value) => {
    setCustomerId(value);
    const cust = customers.find((c) => String(c.id) === String(value));
    setCustomerContact(cust?.mobile_no || '');
  };

  const companyOptions = useMemo(
    () => (customers || []).map((c) => ({
      value: String(c.id),
      label: c.companyname,
      sub: `Customer ID: #${c.id}${c.mobile_no ? ` · Tel: ${c.mobile_no}` : ''}`
    })),
    [customers]
  );

  const productOptions = useMemo(
    () => (products || []).map((p) => ({
      value: String(p.id),
      label: p.productname,
    })),
    [products]
  );

  const updateItem = (idx, field, value) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

  const addRow = () => setItems((prev) => [...prev, emptyItem()]);
  const removeRow = (idx) => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const resetForm = () => {
    setCustomerId('');
    setCustomerContact('');
    setItems(defaultItems());
    setPaidAmount('');
    setInvoiceDate(today());
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const activeItems = items.filter((it) => it.product_id || it.description?.trim() || it.rate !== '');
    const itemsToSave = activeItems.length ? activeItems : items;

    let selectedCustId = customerId;
    if (!selectedCustId || !Number(selectedCustId)) {
      const match = customers.find((c) =>
        String(c.id) === String(customerId) ||
        c.companyname?.toLowerCase().trim() === String(customerId).toLowerCase().trim()
      );
      if (match) {
        selectedCustId = String(match.id);
        setCustomerId(selectedCustId);
      }
    }

    if (!invoiceNo.trim()) { setError('Invoice number is required.'); return; }
    if (!invoiceDate) { setError('Invoice date is required.'); return; }
    if (!selectedCustId || !Number(selectedCustId)) { setError('Please select a company/customer from the dropdown.'); return; }
    if (!activeItems.length) { setError('Please add at least one line item.'); return; }
    if (itemsToSave.some((it) => !it.product_id)) { setError('Every line item needs a product selected.'); return; }
    if (itemsToSave.some((it) => it.rate === '' || Number(it.rate) < 0)) { setError('Every line item needs a valid rate.'); return; }
    if (itemsToSave.some((it) => !Number(it.quantity) || Number(it.quantity) <= 0)) { setError('Quantity must be greater than zero.'); return; }
    if (paid > subAmount) { setError('Paid amount cannot be more than the sub amount.'); return; }

    const autoPaymentStatus = paid >= subAmount && subAmount > 0
      ? 'Full Payment'
      : (paid > 0 ? 'Partial Payment' : 'Due');

    setSaving(true);
    const payload = {
      invoice_no: invoiceNo.trim(),
      invoice_date: invoiceDate,
      customer_id: Number(selectedCustId),
      customer_contact: customerContact,
      items: itemsToSave.map((it) => ({
        product_id: Number(it.product_id),
        description: it.description,
        rate: Number(it.rate),
        quantity: Number(it.quantity),
      })),
      paid_amount: paid,
      payment_type: null,
      payment_status: autoPaymentStatus,
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
            </div>
          </div>

          <div className="form-grid">
            {/* 1. Company Name (searchable) */}
            <div className="form-field">
              <label htmlFor="company">Company Name <span className="req">*</span></label>
              <SearchableSelect
                id="company"
                options={companyOptions}
                value={customerId}
                onChange={handleCustomerChange}
                placeholder="Search company…"
                required
              />
            </div>
            {/* 2. Invoice No */}
            <div className="form-field">
              <label htmlFor="invno">Invoice No <span className="req">*</span></label>
              <input id="invno" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required />
            </div>
            {/* 3. Customer Contact No */}
            <div className="form-field">
              <label htmlFor="contact">Customer Contact No.</label>
              <input id="contact" value={customerContact} onChange={(e) => setCustomerContact(e.target.value)}
                placeholder="Auto-filled from customer" />
            </div>
            {/* 4. Invoice Date */}
            <div className="form-field">
              <label htmlFor="invdate">Invoice Date <span className="req">*</span></label>
              <input id="invdate" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-title">Items</div>
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
                      <SearchableSelect
                        options={productOptions}
                        value={item.product_id}
                        onChange={(val) => updateItem(idx, 'product_id', val)}
                        placeholder="Select product…"
                      />
                    </td>
                    <td>
                      <input
                        value={item.description}
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      />
                    </td>
                    <td>
                      <input type="number" step="0.01" min="0" inputMode="decimal" value={item.rate}
                        onChange={(e) => updateItem(idx, 'rate', e.target.value)} placeholder="0.00" />
                    </td>
                    <td>
                      <input type="number" step="1" min="1" inputMode="numeric" value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)} />
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
