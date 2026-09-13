import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api/endpoints';
import StatCard from '../components/common/StatCard';
import { useAuth } from '../hooks/AuthContext';
import { formatDateDMY } from '../utils/date';
import {
  ChevronRight, InvoiceIcon, StatBoxIcon, StatClientIcon, StatDocIcon,
  StatGstIcon, StatRevenueIcon,
} from '../components/common/Icons';

const PAYMENT_BADGE = {
  'Full Payment': 'badge-success',
  'Partial Payment': 'badge-warning',
  Due: 'badge-danger',
};

export default function Dashboard() {
  const { user, hasPermission } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    dashboardApi.summary()
      .then((res) => setSummary(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load the dashboard. Is the API running?'));
  }, []);

  const loading = !summary && !error;
  const currency = summary?.currency || 'SGD';
  const displayName = user?.name || user?.username || '';

  const cards = [
    { label: 'Total client', value: summary?.totalClients, icon: StatClientIcon, gradient: 'linear-gradient(135deg,#3fae4a,#2d8f38)' },
    { label: 'Total Product', value: summary?.totalProducts, icon: StatBoxIcon, gradient: 'linear-gradient(135deg,#9a9a2e,#6f6f19)' },
    { label: 'Total Invoices', value: summary?.totalInvoices, icon: StatDocIcon, gradient: 'linear-gradient(135deg,#e0287a,#b81c61)' },
    { label: 'Total GST Bills', value: summary?.totalGstBills, icon: StatGstIcon, gradient: 'linear-gradient(135deg,#8b46e0,#6b1fc9)' },
    { label: 'Total Revenue', value: summary ? `${currency} ${summary.totalRevenue}` : null, icon: StatRevenueIcon, gradient: 'linear-gradient(135deg,#14b8a6,#0d7c72)' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">{displayName ? `Welcome back, ${displayName}` : 'Welcome back'}</div>
          <h1>Dashboard</h1>
        </div>
        {hasPermission('invoices.create') && (
          <Link className="btn btn-primary" to="/invoices/add">Create Invoice</Link>
        )}
      </div>

      {error && <div className="login-error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="stat-grid">
        {cards.map((c) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={c.value ?? 0}
            icon={c.icon}
            gradient={c.gradient}
            loading={loading}
          />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 20, marginTop: 24, alignItems: 'start' }}
        className="dash-grid">
        <div className="card">
          <div className="card-head" style={{ marginBottom: 6 }}>
            <div>
              <div className="card-title">Recent Invoices</div>
              <div className="card-sub">The latest billing activity</div>
            </div>
            {hasPermission('invoices.view') && (
              <Link className="btn btn-secondary btn-sm" to="/invoices">
                View all <ChevronRight width={13} height={13} />
              </Link>
            )}
          </div>

          <div className="table-scroll">
            <table className="datatable">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Company</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 5 }).map((__, c) => (
                    <td key={c}><div className="skeleton" style={{ width: `${50 + ((i + c) % 4) * 12}%` }} /></td>
                  ))}</tr>
                ))}

                {!loading && summary?.recentInvoices?.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ borderBottom: 'none' }}>
                      <div className="empty-state">
                        <span className="empty-icon"><InvoiceIcon width={26} height={26} /></span>
                        <h4>No invoices yet</h4>
                        <p>Create your first invoice to see it here.</p>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && summary?.recentInvoices?.map((inv) => (
                  <tr key={inv.id}>
                    <td><span className="cell-strong">#{inv.invoice_no}</span></td>
                    <td>{inv.companyname}</td>
                    <td className="num">{formatDateDMY(inv.invoice_date)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      <span className="cell-strong">{Number(inv.sub_amount).toFixed(2)}</span>
                    </td>
                    <td>
                      <span className={`badge ${PAYMENT_BADGE[inv.payment_status] || 'badge-neutral'}`}>
                        {inv.payment_status || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card">
            <div className="card-title">Outstanding</div>
            <div className="card-sub">Total still unpaid across all invoices</div>
            <div style={{
              marginTop: 16, padding: '18px 20px', borderRadius: 'var(--r-md)',
              background: 'linear-gradient(135deg,#fff7ed,#fef3c7)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#b45309' }}>Amount due</div>
              <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.03em', color: '#92400e' }}>
                {loading ? '—' : `${currency} ${summary?.totalOutstanding ?? '0.00'}`}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Payment Status</div>
            <div className="card-sub">How invoices are settling</div>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              {loading && <div className="skeleton" style={{ height: 38 }} />}
              {!loading && (summary?.paymentBreakdown?.length ? summary.paymentBreakdown : []).map((b) => (
                <div key={b.payment_status} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 14px', borderRadius: 'var(--r-md)', background: 'var(--line-soft)',
                }}>
                  <span className={`badge ${PAYMENT_BADGE[b.payment_status] || 'badge-neutral'}`}>
                    {b.payment_status}
                  </span>
                  <strong style={{ fontSize: 15 }}>{b.count}</strong>
                </div>
              ))}
              {!loading && !summary?.paymentBreakdown?.length && (
                <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No invoice data yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 1000px) { .dash-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
