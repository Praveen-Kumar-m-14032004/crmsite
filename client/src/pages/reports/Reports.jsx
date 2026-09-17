import { useEffect, useMemo, useState } from 'react';
import { customersApi, reportsApi, settingsApi } from '../../api/endpoints';
import { downloadViaApi } from '../../api/download';
import { usePermissions } from '../../hooks/usePermissions';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { formatDateDMY } from '../../utils/date';
import SearchableSelect from '../../components/common/SearchableSelect';
import {
  DownloadIcon, FilterIcon, InvoiceIcon, SpinnerIcon,
} from '../../components/common/Icons';

const emptyFilters = {
  company: '', start: '', end: '', paymentStatus: 'All', status: 'All', invoiceNo: '',
};

const paymentBadge = (status) => ({
  'Full Payment': 'badge-success',
  'Partial Payment': 'badge-warning',
  Due: 'badge-danger',
}[status] || 'badge-neutral');

export default function Reports() {
  const can = usePermissions();
  const toast = useToast();

  const [filters, setFilters] = useState(emptyFilters);
  const [companies, setCompanies] = useState([]);
  const [currency, setCurrency] = useState('SGD');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    customersApi.list({ limit: 1000 })
      .then((res) => setCompanies(res.data.data || []))
      .catch(() => { });
    settingsApi.get()
      .then((res) => setCurrency(res.data?.default_currency || 'SGD'))
      .catch(() => { });
  }, []);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.companyname, label: c.companyname })),
    [companies]
  );

  const set = (field) => (e) => setFilters((f) => ({ ...f, [field]: e.target.value }));

  const buildParams = () => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== 'All') params[k] = v;
    });
    return params;
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await reportsApi.search(buildParams());
      setResults(res.data);
      if (res.data.count === 0) toast.info('No invoices matched those filters');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not run this report'));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilters(emptyFilters);
    setResults(null);
  };

  const handleDownload = async (format) => {
    setDownloading(format);
    const suffix = `${filters.start || 'all'}_to_${filters.end || 'all'}`;
    try {
      await downloadViaApi('/reports', { ...buildParams(), format }, `invoice-report-${suffix}.${format}`);
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(errorMessage(err, `Could not generate the ${format.toUpperCase()}`));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Reports</div>
          <h1>Invoice Report</h1>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head" style={{ marginBottom: 18 }}>
          <div>
            <div className="card-title">Search filters</div>
            <div className="card-sub">Every filter is optional — combine as many as you need</div>
          </div>
          <span className="badge badge-info badge-plain"><FilterIcon width={13} height={13} /> Filters</span>
        </div>

        <form onSubmit={handleSearch}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="company">Company Name</label>
              <SearchableSelect
                id="company"
                options={companyOptions}
                value={filters.company}
                onChange={(val) => setFilters((f) => ({ ...f, company: val }))}
                placeholder="Any company"
              />
            </div>
            <div className="form-field">
              <label htmlFor="start">Start Date</label>
              <input id="start" type="date" value={filters.start} onChange={set('start')} />
            </div>
            <div className="form-field">
              <label htmlFor="end">End Date</label>
              <input id="end" type="date" value={filters.end} onChange={set('end')} />
            </div>
            <div className="form-field">
              <label htmlFor="pstatus">Payment Status</label>
              <select id="pstatus" value={filters.paymentStatus} onChange={set('paymentStatus')}>
                <option>All</option><option>Full Payment</option><option>Partial Payment</option><option>Due</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="istatus">Invoice Status</label>
              <select id="istatus" value={filters.status} onChange={set('status')}>
                <option>All</option><option>Paid</option><option>Unpaid</option><option>Cancelled</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="invno">Invoice No.</label>
              <input id="invno" value={filters.invoiceNo} onChange={set('invoiceNo')} placeholder="e.g. 20260914-101" />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? <><SpinnerIcon width={15} height={15} /> Searching…</> : 'Generate Report'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={handleClear}>Clear Filters</button>
          </div>
        </form>
      </div>

      {results && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Results</div>
              <div className="card-sub">
                {results.count} invoice{results.count === 1 ? '' : 's'} matched
              </div>
            </div>
            {can('reports.export') && results.count > 0 && (
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                {['pdf', 'xlsx', 'csv'].map((fmt) => (
                  <button key={fmt} className="btn btn-secondary btn-sm" disabled={downloading === fmt}
                    onClick={() => handleDownload(fmt)}>
                    {downloading === fmt
                      ? <SpinnerIcon width={14} height={14} />
                      : <DownloadIcon width={14} height={14} />}
                    {fmt === 'xlsx' ? 'Excel' : fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="summary-strip">
            <div className="summary-tile">
              <span>Invoices</span>
              <strong className="num">{results.count}</strong>
            </div>
            <div className="summary-tile accent">
              <span>Total Amount</span>
              <strong className="num">{currency} {results.summary.totalAmount.toFixed(2)}</strong>
            </div>
          </div>

          <div className="table-scroll">
            <table className="datatable">
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Invoice Date</th>
                  <th>Company Name</th>
                  <th style={{ textAlign: 'right' }}>Sub Amount</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ borderBottom: 'none' }}>
                      <div className="empty-state">
                        <span className="empty-icon"><InvoiceIcon width={26} height={26} /></span>
                        <h4>No matching invoices</h4>
                        <p>Try widening the date range or clearing a filter.</p>
                      </div>
                    </td>
                  </tr>
                ) : results.data.map((r) => (
                  <tr key={r.id}>
                    <td><span className="cell-strong">#{r.invoice_no}</span></td>
                    <td className="num">{formatDateDMY(r.invoice_date)}</td>
                    <td>{r.companyname}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{Number(r.sub_amount).toFixed(2)}</td>
                    <td style={{ textAlign: 'center' }}><span className="badge badge-neutral">{r.status === 'Pending' ? 'Unpaid' : r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
