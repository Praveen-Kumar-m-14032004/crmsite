import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { customersApi } from '../../api/endpoints';
import { useDataTable } from '../../hooks/useDataTable';
import { usePermissions } from '../../hooks/usePermissions';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import DataTable from '../../components/common/DataTable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { EditIcon, PlusIcon, TrashIcon } from '../../components/common/Icons';

export default function ManageCustomer() {
  const can = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const table = useDataTable(customersApi.list, { defaultSort: 'companyname', defaultDir: 'asc' });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await customersApi.remove(toDelete.id);
      toast.success(`${toDelete.companyname} deleted`);
      setToDelete(null);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this customer'));
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: '#', label: '#', render: (_r, serial) => <span className="num text-muted">{serial}</span> },
    {
      key: 'companyname', label: 'Company Name', sortable: true,
      render: (r) => <span className="cell-strong">{r.companyname}</span>,
    },
    { key: 'person_incharge', label: 'Person Incharge', sortable: true, render: (r) => r.person_incharge || '—' },
    { key: 'mobile_no', label: 'Mobile No', sortable: true, render: (r) => <span className="num">{r.mobile_no || '—'}</span> },
    { key: 'email', label: 'Email', sortable: true, render: (r) => r.email || '—' },
    {
      key: 'address', label: 'Address',
      render: (r) => (
        <span title={r.address || ''} style={{ display: 'inline-block', maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle' }}>
          {r.address || '—'}
        </span>
      ),
    },
    {
      key: 'action', label: 'Action',
      render: (row) => (
        <div className="row-actions">
          {can('customers.edit') && (
            <button className="btn-icon icon-edit" title="Edit customer" onClick={() => navigate(`/customers/${row.id}/edit`)}>
              <EditIcon width={15} height={15} />
            </button>
          )}
          {can('customers.delete') && (
            <button className="btn-icon icon-delete" title="Delete customer" onClick={() => setToDelete(row)}>
              <TrashIcon width={15} height={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Customer Details</div>
          <h1>Manage Customer</h1>
        </div>
        {can('customers.create') && (
          <Link className="btn btn-primary" to="/customers/add">
            <PlusIcon width={15} height={15} /> Add customer
          </Link>
        )}
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          {...table}
          searchPlaceholder="Search company, contact, email…"
          emptyTitle="No customers yet"
          emptyMessage="Add your first customer to start raising invoices."
        />
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        busy={deleting}
        title="Delete customer?"
        message={`“${toDelete?.companyname}” will be permanently removed. Customers linked to existing invoices cannot be deleted.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
