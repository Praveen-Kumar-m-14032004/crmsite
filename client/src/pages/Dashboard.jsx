import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api/endpoints';
import StatCard from '../components/common/StatCard';
import { useAuth } from '../hooks/AuthContext';
import {
  StatBoxIcon, StatClientIcon, StatDocIcon,
  StatGstIcon, StatRevenueIcon,
} from '../components/common/Icons';


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
    </div>
  );
}
