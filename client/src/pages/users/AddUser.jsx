import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rolesApi, usersApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { SpinnerIcon } from '../../components/common/Icons';

export default function AddUser() {
  const navigate = useNavigate();
  const toast = useToast();

  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', role_id: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    rolesApi.list()
      .then((res) => setRoles(res.data))
      .catch((err) => toast.error(errorMessage(err, 'Could not load roles')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    setSaving(true);
    try {
      await usersApi.create({ ...form, username: form.username.trim(), role_id: Number(form.role_id) });
      toast.success(`User “${form.username}” created`);
      navigate('/users');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create this user'));
    } finally {
      setSaving(false);
    }
  };

  const selectedRole = roles.find((r) => String(r.id) === String(form.role_id));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">User Management</div>
          <h1>Add User</h1>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/users')}>Back to list</button>
      </div>

      <div className="card" style={{ maxWidth: 940 }}>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="name">Name <span className="req">*</span></label>
              <input id="name" value={form.name} onChange={set('name')} placeholder="Full name" required />
            </div>
            <div className="form-field">
              <label htmlFor="username">Username <span className="req">*</span></label>
              <input id="username" value={form.username} onChange={set('username')}
                placeholder="Used to sign in" autoComplete="off" required />
            </div>
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={form.email} onChange={set('email')} placeholder="name@company.com" />
            </div>
            <div className="form-field">
              <label htmlFor="password">Password <span className="req">*</span></label>
              <input id="password" type="password" value={form.password} onChange={set('password')}
                placeholder="Minimum 4 characters" autoComplete="new-password" required />
            </div>
            <div className="form-field">
              <label htmlFor="role">Role <span className="req">*</span></label>
              <select id="role" value={form.role_id} onChange={set('role_id')} required>
                <option value="">Select role…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {selectedRole?.description && <span className="card-sub">{selectedRole.description}</span>}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <><SpinnerIcon width={15} height={15} /> Creating…</> : 'Submit'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/users')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
