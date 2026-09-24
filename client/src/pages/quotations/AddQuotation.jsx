import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { customersApi, productsApi, quotationsApi, settingsApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { toDateInputValue } from '../../utils/date';
import { PlusIcon, SpinnerIcon, TrashIcon } from '../../components/common/Icons';
import SearchableSelect from '../../components/common/SearchableSelect';

const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = () => ({ product_id: '', productname: '', description: '', rate: '', quantity: 1 });
const defaultItems = () => Array.from({ length: 4 }, emptyItem);

export default function AddQuotation() {
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

  const [quotationNo, setQuotationNo] = useState('');
  const [quotationDate, setQuotationDate] = useState(today());
  const [customerId, setCustomerId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [items, setItems] = useState(defaultItems());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      customersApi.list({ limit: 1000 }),
      productsApi.list({ limit: 1000 }),
      settingsApi.get().catch(() => ({ data: {} })),
      isEdit ? quotationsApi.get(id) : quotationsApi.nextNumber(),
    ])
      .then(([cRes, pRes, sRes, qRes]) => {
        if (!alive) return;
        setCustomers(cRes.data.data || []);
        setProducts(pRes.data.data || []);
        setCurrency(sRes.data?.default_currency || 'SGD');

        if (isEdit) {
          const q = qRes.data;
          setQuotationNo(q.quotation_no || '');
          setQuotationDate(toDateInputValue(q.quotation_date || q.created_at));
          setCustomerId(q.customer_id ? String(q.customer_id) : (q.companyname || ''));
          setCompanyName(q.companyname || '');
          setCustomerContact(q.customer_contact || q.mobile_no || '');
          setCustomerAddress(q.address || '');
          setNotes(q.notes || '');

          if (Array.isArray(q.items) && q.items.length) {
            setItems(
              q.items.map((it) => ({
                product_id: it.product_id ? String(it.product_id) : (it.productname || ''),
                productname: it.productname || '',
                description: it.description || '',
                rate: it.rate !== undefined && it.rate !== null ? String(it.rate) : '',
                quantity: it.quantity ? String(Number(it.quantity)) : '1',
              }))
            );
          } else {
            setItems(defaultItems());
          }
        } else {
          setQuotationNo(qRes.data.quotation_no || '');
        }
      })
      .catch((err) => setError(errorMessage(err, 'Could not load quotation form data')))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id, isEdit]);

  const subAmount = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.rate) || 0) * (Number(it.quantity) || 0), 0),
    [items]
  );

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: String(c.id),
        label: `${c.companyname} ${c.mobile_no ? `(${c.mobile_no})` : ''}`,
      })),
    [customers]
  );

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: p.productname,
      })),
    [products]
  );

  const handleCustomerChange = (value) => {
    setCustomerId(value);
    const trimmedVal = String(value).trim().toLowerCase();
    const cust = customers.find(
      (c) => String(c.id) === String(value) || c.companyname?.trim().toLowerCase() === trimmedVal
    );
    if (cust) {
      setCompanyName(cust.companyname);
      setCustomerContact(cust.mobile_no || '');
      setCustomerAddress(cust.address || '');
    } else {
      setCompanyName(value);
    }
  };

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };

      if (field === 'product_id') {
        const prod = products.find(
          (p) => String(p.id) === String(value) || p.productname?.toLowerCase().trim() === String(value).toLowerCase().trim()
        );
        if (prod) {
          item.productname = prod.productname;
          if (prod.rate && !item.rate) item.rate = String(prod.rate);
          if (prod.description && !item.description) item.description = prod.description;
        } else {
          item.productname = value;
        }
      }
      next[index] = item;
      return next;
    });
  };

  const addRow = () => setItems((prev) => [...prev, emptyItem()]);
  const removeRow = (index) => setItems((prev) => prev.filter((_, i) => i !== index));

  const resetForm = () => {
    setCustomerId('');
    setCompanyName('');
    setCustomerContact('');
    setCustomerAddress('');
    setItems(defaultItems());
    setNotes('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const targetCustomerName = companyName.trim() || String(customerId).trim();
    if (!targetCustomerName) {
      const msg = 'Please specify or select a customer';
      setError(msg);
      toast.error(msg);
      return;
    }

    const itemsToSave = items.filter(
      (it) => it.product_id || it.productname || it.description || Number(it.rate) > 0
    );

    if (itemsToSave.length === 0) {
      const msg = 'Please add at least one item to the quotation';
      setError(msg);
      toast.error(msg);
      return;
    }

    setSaving(true);
    try {
      let finalCustId = null;
      let finalCustName = targetCustomerName;

      const trimmedCust = String(customerId).trim();
      const existingCust = customers.find(
        (c) => String(c.id) === trimmedCust || c.companyname?.toLowerCase().trim() === trimmedCust.toLowerCase()
      );
      if (existingCust) {
        finalCustId = existingCust.id;
        finalCustName = existingCust.companyname;
      } else if (Number(trimmedCust)) {
        finalCustId = Number(trimmedCust);
      } else {
        finalCustName = trimmedCust;
      }

      const resolvedItems = itemsToSave.map((it) => {
        const trimmedProd = String(it.product_id).trim();
        const existingProd = products.find(
          (p) => String(p.id) === trimmedProd || p.productname?.toLowerCase().trim() === trimmedProd.toLowerCase()
        );
        return {
          product_id: existingProd ? existingProd.id : (Number(trimmedProd) || null),
          productname: existingProd ? existingProd.productname : (it.productname || trimmedProd),
          description: it.description || '',
          rate: Number(it.rate) || 0,
          quantity: Number(it.quantity) || 1,
          total: Number(((Number(it.rate) || 0) * (Number(it.quantity) || 1)).toFixed(2)),
        };
      });

      const payload = {
        quotation_no: quotationNo.trim(),
        quotation_date: quotationDate,
        customer_id: finalCustId,
        companyname: finalCustName,
        customer_contact: customerContact,
        address: customerAddress,
        items: resolvedItems,
        sub_amount: resolvedItems.reduce((sum, it) => sum + it.total, 0),
        notes: notes.trim(),
      };

      if (isEdit) {
        await quotationsApi.update(id, payload);
        toast.success(`Quotation #${payload.quotation_no} updated`);
      } else {
        await quotationsApi.create(payload);
        toast.success(`Quotation #${payload.quotation_no} created`);
      }
      navigate('/estimates');
    } catch (err) {
      const msg = errorMessage(err, 'Could not save this quotation');
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1>{isEdit ? 'Edit Quotation' : 'Add Quotation'}</h1>
        </div>
        <div className="card" style={{ display: 'grid', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 44 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Quotation</div>
          <h1>{isEdit ? `Edit Quotation #${quotationNo}` : 'Add Quotation'}</h1>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/estimates')}>
          Back to list
        </button>
      </div>

      {error && <div className="login-error" style={{ marginBottom: 18 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-head" style={{ marginBottom: 18 }}>
            <div>
              <div className="card-title">Quotation details</div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="quoteno">
                Quotation No. <span className="req">*</span>
              </label>
              <input
                id="quoteno"
                value={quotationNo}
                onChange={(e) => setQuotationNo(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="customer">
                Customer Name <span className="req">*</span>
              </label>
              <SearchableSelect
                id="customer"
                options={customerOptions}
                value={customerId}
                onChange={handleCustomerChange}
                placeholder="Select or enter customer…"
              />
            </div>

            <div className="form-field">
              <label htmlFor="contact">Customer Contact No.</label>
              <input
                id="contact"
                value={customerContact}
                onChange={(e) => setCustomerContact(e.target.value)}
                placeholder="Auto-filled from customer"
              />
            </div>

            <div className="form-field">
              <label htmlFor="quotedate">
                Quotation Date <span className="req">*</span>
              </label>
              <input
                id="quotedate"
                type="date"
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
                required
              />
            </div>

            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="address">Customer Address</label>
              <input
                id="address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Auto-filled from customer or enter address"
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-title">Items</div>
            </div>
            <span className="badge badge-info badge-plain">
              {items.length} {items.length === 1 ? 'row' : 'rows'}
            </span>
          </div>

          <div className="line-items table-scroll">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th style={{ width: '26%', minWidth: 180 }}>Product</th>
                  <th style={{ minWidth: 140 }}>Description</th>
                  <th style={{ width: '12%', minWidth: 85 }}>Rate</th>
                  <th style={{ width: '10%', minWidth: 70 }}>Quantity</th>
                  <th style={{ width: '13%', minWidth: 95 }}>Total ({currency})</th>
                  <th style={{ width: 48 }} aria-label="Actions" />
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
                      <textarea
                        className="line-item-desc"
                        rows={Math.max(1, Math.min(5, (item.description || '').split('\n').length))}
                        value={item.description ?? ''}
                        placeholder="Enter description..."
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={item.rate}
                        onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        inputMode="numeric"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        readOnly
                        className="num"
                        value={((Number(item.rate) || 0) * (Number(item.quantity) || 0)).toFixed(2)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon icon-delete"
                        title="Remove row"
                        onClick={() => removeRow(idx)}
                        disabled={items.length === 1}
                      >
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
            <div className="form-field" style={{ minWidth: 200 }}>
              <label>Total Amount ({currency})</label>
              <input readOnly className="num" value={subAmount.toFixed(2)} style={{ fontWeight: 700 }} />
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <label htmlFor="notes" style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Notes / Terms &amp; Conditions
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter optional payment terms or quotation notes here..."
              style={{
                width: '100%',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--line)',
                padding: '10px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>

          <div className="form-actions" style={{ marginTop: 24 }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? (
                <>
                  <SpinnerIcon width={15} height={15} /> Saving…
                </>
              ) : isEdit ? (
                'Save changes'
              ) : (
                'Submit Quotation'
              )}
            </button>
            <button className="btn btn-danger" type="button" onClick={resetForm} disabled={saving}>
              Reset
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
