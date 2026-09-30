import { useEffect, useMemo, useState } from 'react';
import { permissionsApi, rolesApi } from '../../api/endpoints';
import { useAuth } from '../../hooks/AuthContext';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { AlertIcon, PlusIcon, SpinnerIcon, TrashIcon } from '../../components/common/Icons';

const ADMIN_ROLE_ID = 1;
const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'print', 'export', 'manage'];

// Display order, label and a one-line hint for each permission module. Modules
// the API adds later still render, after these, under their raw name.
const MODULE_META = {
  dashboard: { label: 'Dashboard', hint: 'Summary cards on the home screen' },
  customers: { label: 'Customers', hint: 'Customer master data' },
  products: { label: 'Products', hint: 'Product / service master data' },
  invoices: { label: 'Invoices (all)', hint: 'Every invoice, GST or not' },
  gst_invoices: { label: 'GST invoices only', hint: 'Only invoices that contain the GST line item. Use this instead of "Invoices (all)" for GST-only roles such as Supervisor.' },
  quotations: { label: 'Quotations', hint: 'Estimates sent before invoicing' },
  reports: { label: 'Reports', hint: 'Search and export' },
  users: { label: 'Users', hint: 'Add, edit, deactivate users' },
  roles: { label: 'Roles & Permissions', hint: 'This screen' },
  settings: { label: 'Company Settings', hint: 'Letterhead, currency, contact details' },
};
const MODULE_ORDER = Object.keys(MODULE_META);

export default function RolesPermissions() {
  const toast = useToast();
  const { refreshUser } = useAuth();

  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [details, setDetails] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState(null);

  const loadRoles = async (selectId) => {
    const res = await rolesApi.list();
    setRoles(res.data);
    setSelectedRoleId((prev) => selectId ?? prev ?? res.data[0]?.id ?? null);
    return res.data;
  };

  useEffect(() => {
    Promise.all([loadRoles(), permissionsApi.list().then((res) => setPermissions(res.data))])
      .catch((err) => toast.error(errorMessage(err, 'Could not load roles')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the selected role into the editable matrix. Skipped while creating so
  // a fresh role's ticks aren't overwritten by a background refresh.
  useEffect(() => {
    if (creating) return;
    const role = roles.find((r) => r.id === selectedRoleId);
    setCheckedIds(new Set(role?.permissionIds || []));
    setDetails({ name: role?.name || '', description: role?.description || '' });
  }, [selectedRoleId, roles, creating]);

  const modules = useMemo(() => {
    const grouped = {};
    permissions.forEach((p) => {
      grouped[p.module] = grouped[p.module] || {};
      grouped[p.module][p.action] = p;
    });
    const rank = (mod) => {
      const index = MODULE_ORDER.indexOf(mod);
      return index === -1 ? MODULE_ORDER.length : index;
    };
    return Object.entries(grouped).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  }, [permissions]);

  const actionColumns = useMemo(() => {
    const present = new Set(permissions.map((p) => p.action));
    return ACTION_ORDER.filter((a) => present.has(a));
  }, [permissions]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isAdminRole = !creating && selectedRoleId === ADMIN_ROLE_ID;
  const matrixLocked = isAdminRole;
  const allPermissionIds = useMemo(() => permissions.map((p) => p.id), [permissions]);

  const toggle = (permId) => {
    if (matrixLocked) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId); else next.add(permId);
      return next;
    });
  };

  const toggleModuleRow = (actions) => {
    if (matrixLocked) return;
    const ids = Object.values(actions).map((p) => p.id);
    const allOn = ids.every((i) => checkedIds.has(i));
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((i) => (allOn ? next.delete(i) : next.add(i)));
      return next;
    });
  };

  const setAll = (on) => {
    if (matrixLocked) return;
    setCheckedIds(on ? new Set(allPermissionIds) : new Set());
  };

  const saveRole = async () => {
    if (!selectedRole) return;
    const name = details.name.trim();
    if (!selectedRole.is_system && !name) {
      toast.error('Role name is required');
      return;
    }
    setSaving(true);
    try {
      await rolesApi.update(selectedRoleId, {
        name: selectedRole.is_system ? selectedRole.name : name,
        description: details.description.trim(),
        permissionIds: Array.from(checkedIds),
      });
      toast.success(`${selectedRole.is_system ? selectedRole.name : name} saved`);
      await loadRoles();
      // If our own role changed, pick up the new permissions straight away.
      refreshUser();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this role'));
    } finally {
      setSaving(false);
    }
  };

  const createRole = async (e) => {
    e.preventDefault();
    const name = newRole.name.trim();
    if (!name) {
      toast.error('Role name is required');
      return;
    }
    if (checkedIds.size === 0) {
      toast.error('Tick at least one permission for the new role');
      return;
    }
    setSaving(true);
    try {
      const res = await rolesApi.create({
        name,
        description: newRole.description.trim(),
        permissionIds: Array.from(checkedIds),
      });
      toast.success(`Role "${name}" created`);
      setCreating(false);
      setNewRole({ name: '', description: '' });
      await loadRoles(res.data.id);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create this role'));
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async () => {
    try {
      await rolesApi.remove(toDelete.id);
      toast.success(`Role "${toDelete.name}" deleted`);
      setToDelete(null);
      const list = await loadRoles();
      setSelectedRoleId(list[0]?.id ?? null);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this role'));
    }
  };

  const startCreating = () => {
    setCreating(true);
    setCheckedIds(new Set());
    setNewRole({ name: '', description: '' });
  };

  const cancelCreating = () => {
    setCreating(false);
    setNewRole({ name: '', description: '' });
  };

  const matrix = (
    <div className="matrix-wrap">
      <table className="checkbox-matrix">
        <thead>
          <tr>
            <th style={{ minWidth: 190 }}>Module</th>
            {actionColumns.map((a) => <th key={a}>{a}</th>)}
            <th style={{ width: 70 }}>All</th>
          </tr>
        </thead>
        <tbody>
          {modules.map(([mod, actions]) => {
            const ids = Object.values(actions).map((p) => p.id);
            const allOn = ids.every((i) => checkedIds.has(i));
            const meta = MODULE_META[mod];
            return (
              <tr key={mod}>
                <td style={{ textTransform: 'none' }}>
                  <div>{meta?.label || mod}</div>
                  {meta?.hint && (
                    <div className="card-sub" style={{ fontWeight: 400, marginTop: 2, maxWidth: 300, whiteSpace: 'normal' }}>{meta.hint}</div>
                  )}
                </td>
                {actionColumns.map((a) => (
                  <td key={a}>
                    {actions[a] ? (
                      <input
                        type="checkbox"
                        checked={checkedIds.has(actions[a].id)}
                        disabled={matrixLocked}
                        onChange={() => toggle(actions[a].id)}
                        aria-label={`${meta?.label || mod} ${a}`}
                      />
                    ) : <span className="text-muted">–</span>}
                  </td>
                ))}
                <td>
                  <input type="checkbox" checked={allOn} disabled={matrixLocked} onChange={() => toggleModuleRow(actions)}
                    aria-label={`Toggle all ${meta?.label || mod}`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const bulkButtons = !matrixLocked && (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 10 }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAll(true)}>Select all</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAll(false)}>Clear all</button>
    </div>
  );

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1>Roles &amp; Permissions</h1></div>
        <div className="card"><div className="skeleton" style={{ height: 220 }} /></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">User Management</div>
          <h1>Roles &amp; Permissions</h1>
        </div>
        <button className={`btn ${creating ? 'btn-secondary' : 'btn-primary'}`} onClick={() => (creating ? cancelCreating() : startCreating())}>
          {creating ? 'Cancel' : <><PlusIcon width={15} height={15} /> New Role</>}
        </button>
      </div>

      {creating ? (
        <div className="card">
          <div className="card-head" style={{ marginBottom: 18 }}>
            <div>
              <div className="card-title">Create a custom role</div>
              <div className="card-sub">Pick exactly what this role may do. Tip: for a GST-only role tick "GST invoices only", not "Invoices (all)".</div>
            </div>
          </div>
          <form onSubmit={createRole}>
            <div className="form-grid" style={{ marginBottom: 22 }}>
              <div className="form-field">
                <label>Role Name <span className="req">*</span></label>
                <input value={newRole.name} onChange={(e) => setNewRole((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Operations" maxLength={40} required />
              </div>
              <div className="form-field">
                <label>Description</label>
                <input value={newRole.description} onChange={(e) => setNewRole((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What this role is for" maxLength={200} />
              </div>
            </div>
            {bulkButtons}
            {matrix}
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? <><SpinnerIcon width={15} height={15} /> Creating…</> : 'Create Role'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={cancelCreating}>Cancel</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card">
          <div className="card-head" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-title">Select a role</div>
              <div className="card-sub">Tick the actions each role is allowed to perform. Changes apply to signed-in users within a few seconds.</div>
            </div>
            {selectedRole && !selectedRole.is_system && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setToDelete(selectedRole)}
                disabled={selectedRole.userCount > 0}
                title={selectedRole.userCount > 0 ? `${selectedRole.userCount} user(s) still use this role` : 'Delete this role'}
              >
                <TrashIcon width={14} height={14} /> Delete role
              </button>
            )}
          </div>

          <div className="role-chips">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`role-chip ${r.id === selectedRoleId ? 'active' : ''}`}
                onClick={() => setSelectedRoleId(r.id)}
              >
                <strong>{r.name}</strong>
                <span>
                  {r.permissionIds.length} permissions · {r.userCount ?? 0} {r.userCount === 1 ? 'user' : 'users'}{r.is_system ? ' · built-in' : ''}
                </span>
              </button>
            ))}
          </div>

          {selectedRole && (
            <div className="form-grid" style={{ marginBottom: 18 }}>
              <div className="form-field">
                <label>Role Name</label>
                <input
                  value={details.name}
                  onChange={(e) => setDetails((f) => ({ ...f, name: e.target.value }))}
                  disabled={Boolean(selectedRole.is_system)}
                  title={selectedRole.is_system ? 'Built-in roles keep their name' : undefined}
                  maxLength={40}
                />
              </div>
              <div className="form-field">
                <label>Description</label>
                <input
                  value={details.description}
                  onChange={(e) => setDetails((f) => ({ ...f, description: e.target.value }))}
                  disabled={matrixLocked}
                  placeholder="What this role is for"
                  maxLength={200}
                />
              </div>
            </div>
          )}

          {isAdminRole && (
            <div className="trash-banner">
              <AlertIcon width={17} height={17} style={{ color: 'var(--purple-600)', flexShrink: 0 }} />
              <div><strong>Admin always has every permission.</strong> It cannot be restricted, so nobody can be locked out of user and role management.</div>
            </div>
          )}

          {bulkButtons}
          {matrix}

          <div className="form-actions">
            <button className="btn btn-primary" onClick={saveRole} disabled={saving || !selectedRoleId || matrixLocked}>
              {saving ? <><SpinnerIcon width={15} height={15} /> Saving…</> : 'Save Permissions'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete role?"
        message={`"${toDelete?.name}" will be removed. Users assigned to it must be moved to another role first.`}
        onConfirm={deleteRole}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
