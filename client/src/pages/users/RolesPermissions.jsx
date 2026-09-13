import { useEffect, useMemo, useState } from 'react';
import { permissionsApi, rolesApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { PlusIcon, SpinnerIcon, TrashIcon } from '../../components/common/Icons';

const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'print', 'export', 'manage'];

export default function RolesPermissions() {
  const toast = useToast();

  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
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

  // Mirror the selected role's permissions into the editable matrix. Skipped while
  // creating so a fresh role's ticks aren't overwritten by a background refresh.
  useEffect(() => {
    if (creating) return;
    const role = roles.find((r) => r.id === selectedRoleId);
    setCheckedIds(new Set(role?.permissionIds || []));
  }, [selectedRoleId, roles, creating]);

  const modules = useMemo(() => {
    const grouped = {};
    permissions.forEach((p) => {
      grouped[p.module] = grouped[p.module] || {};
      grouped[p.module][p.action] = p;
    });
    return grouped;
  }, [permissions]);

  const actionColumns = useMemo(() => {
    const present = new Set(permissions.map((p) => p.action));
    return ACTION_ORDER.filter((a) => present.has(a));
  }, [permissions]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  const toggle = (permId) => setCheckedIds((prev) => {
    const next = new Set(prev);
    if (next.has(permId)) next.delete(permId); else next.add(permId);
    return next;
  });

  const toggleModuleRow = (actions) => {
    const ids = Object.values(actions).map((p) => p.id);
    const allOn = ids.every((i) => checkedIds.has(i));
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((i) => (allOn ? next.delete(i) : next.add(i)));
      return next;
    });
  };

  const saveRole = async () => {
    setSaving(true);
    try {
      await rolesApi.update(selectedRoleId, {
        name: selectedRole.name,
        description: selectedRole.description,
        permissionIds: Array.from(checkedIds),
      });
      toast.success(`${selectedRole.name} permissions saved`);
      await loadRoles();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save permissions'));
    } finally {
      setSaving(false);
    }
  };

  const createRole = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await rolesApi.create({ ...newRole, permissionIds: Array.from(checkedIds) });
      toast.success(`Role “${newRole.name}” created`);
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
      toast.success(`Role “${toDelete.name}” deleted`);
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

  const matrix = (
    <div className="matrix-wrap">
      <table className="checkbox-matrix">
        <thead>
          <tr>
            <th style={{ minWidth: 130 }}>Module</th>
            {actionColumns.map((a) => <th key={a}>{a}</th>)}
            <th style={{ width: 70 }}>All</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(modules).map(([mod, actions]) => {
            const ids = Object.values(actions).map((p) => p.id);
            const allOn = ids.every((i) => checkedIds.has(i));
            return (
              <tr key={mod}>
                <td>{mod}</td>
                {actionColumns.map((a) => (
                  <td key={a}>
                    {actions[a] ? (
                      <input
                        type="checkbox"
                        checked={checkedIds.has(actions[a].id)}
                        onChange={() => toggle(actions[a].id)}
                        aria-label={`${mod} ${a}`}
                      />
                    ) : <span className="text-muted">–</span>}
                  </td>
                ))}
                <td>
                  <input type="checkbox" checked={allOn} onChange={() => toggleModuleRow(actions)}
                    aria-label={`Toggle all ${mod}`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
        <button className={`btn ${creating ? 'btn-secondary' : 'btn-primary'}`} onClick={() => (creating ? setCreating(false) : startCreating())}>
          {creating ? 'Cancel' : <><PlusIcon width={15} height={15} /> New Role</>}
        </button>
      </div>

      {creating ? (
        <div className="card">
          <div className="card-head" style={{ marginBottom: 18 }}>
            <div>
              <div className="card-title">Create a custom role</div>
              <div className="card-sub">Pick exactly what this role may do</div>
            </div>
          </div>
          <form onSubmit={createRole}>
            <div className="form-grid" style={{ marginBottom: 22 }}>
              <div className="form-field">
                <label>Role Name <span className="req">*</span></label>
                <input value={newRole.name} onChange={(e) => setNewRole((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Operations" required />
              </div>
              <div className="form-field">
                <label>Description</label>
                <input value={newRole.description} onChange={(e) => setNewRole((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What this role is for" />
              </div>
            </div>
            {matrix}
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? <><SpinnerIcon width={15} height={15} /> Creating…</> : 'Create Role'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card">
          <div className="card-head" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-title">Select a role</div>
              <div className="card-sub">Tick the actions each role is allowed to perform</div>
            </div>
            {selectedRole && !selectedRole.is_system && (
              <button className="btn btn-secondary btn-sm" onClick={() => setToDelete(selectedRole)}>
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
                <span>{r.permissionIds.length} permissions{r.is_system ? ' · system' : ''}</span>
              </button>
            ))}
          </div>

          {matrix}

          <div className="form-actions">
            <button className="btn btn-primary" onClick={saveRole} disabled={saving || !selectedRoleId}>
              {saving ? <><SpinnerIcon width={15} height={15} /> Saving…</> : 'Save Permissions'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete role?"
        message={`“${toDelete?.name}” will be removed. Users assigned to it must be moved to another role first.`}
        onConfirm={deleteRole}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
