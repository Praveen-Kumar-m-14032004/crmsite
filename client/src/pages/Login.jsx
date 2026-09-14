import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { AlertIcon, BrandLockup, CheckIcon, SpinnerIcon } from '../components/common/Icons';

const HIGHLIGHTS = [
  'Customer, product and invoice management in one place',
  'GST billing with instant PDF invoices',
  'Role-based access for your whole team',
];

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const status = err.response?.status;
      setError(
        status === 401
          ? 'Incorrect username or password.'
          : err.response?.data?.message
            || 'Cannot reach the server. Make sure the API is running on port 5000.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-aside">
        <BrandLockup onDark />
        <div>
          <h2>Clearance paperwork, handled.</h2>
          <p>
            The declaration and billing workspace built for freight forwarders and
            customs agents.
          </p>
          <div className="login-points">
            {HIGHLIGHTS.map((h) => (
              <div className="login-point" key={h}>
                <span className="dot"><CheckIcon width={13} height={13} /></span>
                {h}
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 1, fontSize: 12, opacity: 0.7 }}>
          © {new Date().getFullYear()} Permit Declaration
        </div>
      </aside>

      <main className="login-main">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card-logo" style={{ marginBottom: 18 }}>
            <BrandLockup width={165} />
          </div>
          <h1>Welcome back</h1>
          <p className="subtitle">Sign in to continue to your dashboard.</p>

          {error && (
            <div className="login-error">
              <AlertIcon width={17} height={17} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-field" style={{ marginBottom: 16 }}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={loading} style={{ marginTop: 26 }}>
            {loading ? <><SpinnerIcon width={16} height={16} /> Signing in…</> : 'Sign in'}
          </button>

          <div className="login-hint">
            Demo account — <code>admin</code> / <code>admin</code>
          </div>
        </form>
      </main>
    </div>
  );
}
