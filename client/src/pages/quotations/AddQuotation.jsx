import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { customersApi, productsApi, quotationsApi, settingsApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { toDateInputValue } from '../../utils/date';
import { EyeIcon, EyeOffIcon, PlusIcon, SpinnerIcon, TrashIcon } from '../../components/common/Icons';
import SearchableSelect from '../../components/common/SearchableSelect';
import {
  VISIBILITY_LABELS,
  buildDefaultSections,
  defaultVisibility,
  lineTotal,
  resolveSections,
  resolveVisibility,
  visibleTotal,
} from '../../utils/quotationSections';

const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = () => ({ product_id: '', productname: '', description: '', rate: '', quantity: 1, hidden: false });
const defaultItems = () => Array.from({ length: 4 }, emptyItem);
const emptyTurn = () => ({ priority: '', timing: '' });

// Document sections that can be shown or hidden (the Description column toggle
// lives with the items table).
const SECTION_KEYS = ['doc_title', 'item_cost', 'turnaround', 'procedures', 'operating_hours', 'terms', 'closing_note', 'notes'];

const sectionTextareaStyle = {
  width: '100%',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--line)',
  padding: '10px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'vertical',
};

/** Show / hide pill. Nothing is deleted when hidden; it is just left off the document. */
function ShowToggle({ on, onChange, shownLabel = 'Shown', hiddenLabel = 'Hidden' }) {
  return (
    <button
      type="button"
      className={`vis-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      title={on ? 'Shown on the quotation. Click to hide it.' : 'Hidden from the quotation. Click to show it.'}
    >
      {on ? <EyeIcon width={13} height={13} /> : <EyeOffIcon width={13} height={13} />}
      <span>{on ? shownLabel : hiddenLabel}</span>
    </button>
  );
}

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
  const [personIncharge, setPersonIncharge] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [items, setItems] = useState(defaultItems());
  const [notes, setNotes] = useState('');
  const [sections, setSections] = useState(() => buildDefaultSections());
  const [visibility, setVisibility] = useState(() => defaultVisibility());
  const [sectionDefaults, setSectionDefaults] = useState(null);

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
        const settings = sRes.data || {};
        setCustomers(cRes.data.data || []);
        setProducts(pRes.data.data || []);
        setCurrency(settings.default_currency || 'SGD');

        const sectionOpts = {
          currency: settings.default_currency || 'SGD',
          companyName: settings.company_name || 'Permit Declaration',
          email: settings.email || 'Ops@permitdeclaration.sg',
          contact: settings.mobile || settings.tel || settings.contact_no || '',
        };
        setSectionDefaults(sectionOpts);

        if (isEdit) {
          const q = qRes.data;
          setQuotationNo(q.quotation_no || '');
          setQuotationDate(toDateInputValue(q.quotation_date || q.created_at));
          setCustomerId(q.customer_id ? String(q.customer_id) : (q.companyname || ''));
          setCompanyName(q.companyname || '');
          setPersonIncharge(q.person_incharge || '');
          setCustomerContact(q.customer_contact || q.mobile_no || '');
          setCustomerAddress(q.address || '');
          setNotes(q.notes || '');
          setSections(resolveSections(q, sectionOpts));
          setVisibility(resolveVisibility(q));

          if (Array.isArray(q.items) && q.items.length) {
            setItems(
              q.items.map((it) => ({
                product_id: it.product_id ? String(it.product_id) : (it.productname || ''),
                productname: it.productname || '',
                description: it.description || '',
                rate: it.rate !== undefined && it.rate !== null ? String(it.rate) : '',
                quantity: it.quantity != null ? String(Number(it.quantity) || 1) : '1',
                hidden: it.hidden === true,
              }))
            );
          } else {
            setItems(defaultItems());
          }
        } else {
          setQuotationNo(qRes.data.quotation_no || '');
          setSections(buildDefaultSections(sectionOpts));
          setVisibility(defaultVisibility());
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

  const subAmount = useMemo(() => visibleTotal(items), [items]);
  const shownCount = useMemo(() => items.filter((it) => !it.hidden).length, [items]);
  const hiddenCount = items.length - shownCount;

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
      setPersonIncharge(cust.person_incharge || '');
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
  const toggleItemHidden = (index) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, hidden: !it.hidden } : it)));

  const updateSection = (field, value) => setSections((prev) => ({ ...prev, [field]: value }));
  const setVis = (key, on) => setVisibility((prev) => ({ ...prev, [key]: on }));
  const setAllSections = (on) =>
    setVisibility((prev) => ({ ...prev, ...Object.fromEntries(SECTION_KEYS.map((key) => [key, on])) }));

  const updateTurn = (index, field, value) =>
    setSections((prev) => {
      const turnaround = prev.turnaround.map((t, i) => (i === index ? { ...t, [field]: value } : t));
      return { ...prev, turnaround };
    });
  const addTurn = () => setSections((prev) => ({ ...prev, turnaround: [...prev.turnaround, emptyTurn()] }));
  const removeTurn = (index) =>
    setSections((prev) => ({ ...prev, turnaround: prev.turnaround.filter((_, i) => i !== index) }));

  const resetForm = () => {
    setCustomerId('');
    setCompanyName('');
    setPersonIncharge('');
    setCustomerContact('');
    setCustomerAddress('');
    setItems(defaultItems());
    setNotes('');
    setSections(buildDefaultSections(sectionDefaults || { currency }));
    setVisibility(defaultVisibility());
    setError('');
  };

  const fail = (msg) => {
    setError(msg);
    toast.error(msg);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const targetCustomerName = companyName.trim() || String(customerId).trim();
    if (!targetCustomerName) return fail('Please specify or select a customer');

    const itemsToSave = items.filter(
      (it) => it.product_id || it.productname || it.description || Number(it.rate) > 0
    );
    if (itemsToSave.length === 0) return fail('Please add at least one item to the quotation');
    if (itemsToSave.every((it) => it.hidden)) {
      return fail('At least one line item must be shown on the quotation. Hidden items are not quoted.');
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
          total: lineTotal({ rate: it.rate, quantity: Number(it.quantity) || 1 }),
          hidden: Boolean(it.hidden),
        };
      });

      const cleanTurnaround = sections.turnaround
        .map((t) => ({ priority: (t.priority || '').trim(), timing: (t.timing || '').trim() }))
        .filter((t) => t.priority || t.timing);
      const cleanTerms = (Array.isArray(sections.terms) ? sections.terms : [])
        .map((t) => String(t).trim())
        .filter(Boolean);

      const payload = {
        quotation_no: quotationNo.trim(),
        quotation_date: quotationDate,
        customer_id: finalCustId,
        companyname: finalCustName,
        person_incharge: personIncharge.trim(),
        customer_contact: customerContact,
        address: customerAddress,
        items: resolvedItems,
        sub_amount: visibleTotal(resolvedItems),
        notes: notes.trim(),
        doc_title: (sections.doc_title || '').trim(),
        item_cost: sections.item_cost || '',
        turnaround: cleanTurnaround,
        procedures: sections.procedures || '',
        operating_hours: sections.operating_hours || '',
        terms: cleanTerms,
        closing_note: sections.closing_note || '',
        visibility,
      };

      if (isEdit) {
        await quotationsApi.update(id, payload);
        toast.success(`Quotation #${payload.quotation_no} updated`);
        navigate(`/estimates/${id}`);
      } else {
        const res = await quotationsApi.create(payload);
        toast.success(`Quotation #${payload.quotation_no} created`);
        navigate(res.data?.id ? `/estimates/${res.data.id}` : '/estimates');
      }
    } catch (err) {
      fail(errorMessage(err, 'Could not save this quotation'));
    } finally {
      setSaving(false);
    }
  };

  /** One editable document section with its show / hide pill. */
  const sectionBlock = (key, content, hint) => {
    const on = visibility[key];
    return (
      <div className={`doc-section${on ? '' : ' is-hidden'}`}>
        <div className="doc-section-head">
          <label htmlFor={on ? key : undefined}>{VISIBILITY_LABELS[key]}</label>
          <ShowToggle on={on} onChange={(v) => setVis(key, v)} />
        </div>
        {on ? (
          <>
            {content}
            {hint && <div className="hint">{hint}</div>}
          </>
        ) : (
          <div className="doc-section-off">
            Hidden from the quotation. The content is kept and comes back when you show it again.
          </div>
        )}
      </div>
    );
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

  const descriptionShown = visibility.description;

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
              <label htmlFor="person">Person In-Charge</label>
              <input
                id="person"
                value={personIncharge}
                onChange={(e) => setPersonIncharge(e.target.value)}
                placeholder="Auto-filled from customer"
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

            <div className="form-field">
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
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                Listed on the quotation like an invoice: product, description, unit cost, quantity and total.
                Use the eye on a row to leave that item off the quotation (and its total) without deleting it.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <ShowToggle
                on={descriptionShown}
                onChange={(v) => setVis('description', v)}
                shownLabel="Description column shown"
                hiddenLabel="Description column hidden"
              />
              <span className="badge badge-info badge-plain">
                {shownCount} of {items.length} shown
              </span>
            </div>
          </div>

          <div className="line-items table-scroll">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th style={{ width: '24%', minWidth: 170 }}>Product</th>
                  <th style={{ minWidth: 140 }}>Description</th>
                  <th style={{ width: '11%', minWidth: 85 }}>Rate</th>
                  <th style={{ width: '9%', minWidth: 70 }}>Quantity</th>
                  <th style={{ width: '12%', minWidth: 95 }}>Total ({currency})</th>
                  <th style={{ width: 110 }}>On quotation</th>
                  <th style={{ width: 48 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className={item.hidden ? 'row-hidden' : undefined}>
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
                        placeholder={descriptionShown ? 'Enter description...' : 'Description column is hidden on the quotation'}
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
                      <input readOnly className="num" value={lineTotal(item).toFixed(2)} />
                    </td>
                    <td className="row-toggle-cell">
                      <ShowToggle on={!item.hidden} onChange={() => toggleItemHidden(idx)} />
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
              <label>Total ({currency})</label>
              <input readOnly className="num" value={subAmount.toFixed(2)} style={{ fontWeight: 700 }} />
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                {hiddenCount > 0
                  ? `${hiddenCount} hidden ${hiddenCount === 1 ? 'item is' : 'items are'} not included.`
                  : 'All line items are included.'}
              </div>
            </div>
          </div>
        </div>

        {/* ===== EDITABLE DOCUMENT CONTENT ===== */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-title">Quotation document content</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                Printed below the items table on the quotation view &amp; PDF. Each section can be edited, or hidden
                with its eye button. A section left empty is not printed either.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllSections(true)}>Show all</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllSections(false)}>Hide all</button>
            </div>
          </div>

          {sectionBlock(
            'doc_title',
            <input id="doc_title" value={sections.doc_title} onChange={(e) => updateSection('doc_title', e.target.value)} />
          )}

          {sectionBlock(
            'item_cost',
            <textarea
              id="item_cost"
              rows={2}
              value={sections.item_cost}
              onChange={(e) => updateSection('item_cost', e.target.value)}
              style={sectionTextareaStyle}
            />,
            'One line per paragraph.'
          )}

          {sectionBlock(
            'turnaround',
            <>
              <div className="line-items table-scroll">
                <table className="line-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45%', minWidth: 160 }}>Priority</th>
                      <th style={{ minWidth: 160 }}>Permit Returning Timings</th>
                      <th style={{ width: 48 }} aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {sections.turnaround.map((t, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            value={t.priority}
                            onChange={(e) => updateTurn(i, 'priority', e.target.value)}
                            placeholder="Priority"
                          />
                        </td>
                        <td>
                          <input
                            value={t.timing}
                            onChange={(e) => updateTurn(i, 'timing', e.target.value)}
                            placeholder="Returning timing"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-icon icon-delete"
                            title="Remove row"
                            onClick={() => removeTurn(i)}
                            disabled={sections.turnaround.length === 1}
                          >
                            <TrashIcon width={15} height={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="add-row-btn" onClick={addTurn}>
                <PlusIcon width={15} height={15} /> Add row
              </button>
            </>
          )}

          {sectionBlock(
            'procedures',
            <textarea
              id="procedures"
              rows={4}
              value={sections.procedures}
              onChange={(e) => updateSection('procedures', e.target.value)}
              style={sectionTextareaStyle}
            />,
            'One line per paragraph.'
          )}

          {sectionBlock(
            'operating_hours',
            <textarea
              id="operating_hours"
              rows={4}
              value={sections.operating_hours}
              onChange={(e) => updateSection('operating_hours', e.target.value)}
              style={sectionTextareaStyle}
            />,
            'One line per paragraph.'
          )}

          {sectionBlock(
            'terms',
            <textarea
              id="terms"
              rows={7}
              value={(sections.terms || []).join('\n')}
              onChange={(e) => updateSection('terms', e.target.value.split('\n'))}
              style={sectionTextareaStyle}
            />,
            'One condition per line — each line becomes a bullet point.'
          )}

          {sectionBlock(
            'closing_note',
            <textarea
              id="closing_note"
              rows={2}
              value={sections.closing_note}
              onChange={(e) => updateSection('closing_note', e.target.value)}
              style={sectionTextareaStyle}
            />
          )}

          {sectionBlock(
            'notes',
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional payment terms or quotation notes..."
              style={sectionTextareaStyle}
            />
          )}
        </div>

        {/* ===== ACTIONS ===== */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="form-actions" style={{ marginTop: 0 }}>
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
