import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rolesApi, usersApi } from '../../api/endpoints';
import { useDataTable } from '../../hooks/useDataTable';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/AuthContext';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import DataTable from '../../components/common/DataTable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Modal from '../../components/common/Modal';
import { EditIcon, PauseIcon, PlayIcon, PlusIcon, SpinnerIcon, TrashIcon } from '../../components/common/Icons';

export default function ManageUsers() {
  const can = usePermissions();
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const table = useDataTable(usersApi.list);

  const [roles, setRoles] = useState([]);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role_id: '', password: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    rolesApi.list().then((res) => setRoles(res.data)).catch(() => {});
  }, []);

  const openEdit = (row) => {
    setEditing(row);
    setEditForm({ name: row.name || '', email: row.email || '', role_id: row.role_id, password: '' });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: editForm.name, email: editForm.email, role_id: Number(editForm.role_id) };
      if (editForm.password) payload.password = editForm.password;
      await usersApi.update(editing.id, payload);
      toast.success('User updated');
      setEditing(null);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update this user'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    try {
      await usersApi.update(row.id, { is_active: row.is_active ? 0 : 1 });
      toast.success(`${row.username} ${row.is_active ? 'deactivated' : 'activated'}`);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change this user'));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await usersApi.remove(toDelete.id);
      toast.success(`User “${toDelete.username}” deleted`);
      setToDelete(null);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this user'));
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: '#', label: '#', render: (_r, serial) => <span className="num text-muted">{serial}</span> },
    { key: 'name', label: 'Name', render: (r) => <span className="cell-strong">{r.name || '—'}</span> },
    { key: 'username', label: 'Username' },
    { key: 'email', label: 'Email', render: (r) => r.email || '—' },
    { key: 'role_name', label: 'Role', render: (r) => <span className="badge badge-info">{r.role_name}</span> },
    {
      key: 'is_active', label: 'Status',
      render: (r) => (
        <span className={`badge ${r.is_active ? 'badge-success' : 'badge-danger'}`}>
          {r.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'action', label: 'Action',
      render: (row) => {
        const isSelf = row.id === currentUser?.id;
        return (
          <div className="row-actions">
            <button className="btn-icon icon-edit" title="Edit user" onClick={() => openEdit(row)}>
              <EditIcon width={15} height={15} />
            </button>
            <button
              className="btn-icon icon-neutral"
              title={isSelf ? 'You cannot deactivate your own account' : row.is_active ? 'Deactivate' : 'Activate'}
              disabled={isSelf}
              onClick={() => toggleActive(row)}
            >
              {row.is_active ? <PauseIcon width={14} height={14} /> : <PlayIcon width={14} height={14} />}
            </button>
            <button
              className="btn-icon icon-delete"
              title={isSelf ? 'You cannot delete your own account' : 'Delete user'}
              disabled={isSelf}
              onClick={() => setToDelete(row)}
            >
              <TrashIcon width={15} height={15} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">User Management</div>
          <h1>Manage Users</h1>
        </div>
        {can('users.manage') && (
          <Link className="btn btn-primary" to="/users/add">
            <PlusIcon width={15} height={15} /> Add User
          </Link>
        )}
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          {...table}
          searchPlaceholder="Search name, username, email…"
          emptyTitle="No users yet"
          emptyMessage="Invite your team and assign them a role."
        />
      </div>

      <Modal
        open={Boolean(editing)}
        title={`Edit ${editing?.username || ''}`}
        subtitle="Leave the password blank to keep the current one."
        onClose={() => setEditing(null)}
        width={460}
      >
        <form onSubmit={handleEditSubmit}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="form-field">
              <label>Name</label>
              <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>Email</label>
              <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>Role</label>
              <select value={editForm.role_id} onChange={(e) => setEditForm((f) => ({ ...f, role_id: e.target.value }))}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>New password</label>
              <input type="password" value={editForm.password} autoComplete="new-password"
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Leave blank to keep current" />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <><SpinnerIcon width={15} height={15} /> Saving…</> : 'Save changes'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        busy={deleting}
        title="Delete user?"
        message={`“${toDelete?.username}” will lose access immediately and be removed.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
