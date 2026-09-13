import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { invoicesApi, settingsApi } from '../../api/endpoints';
import { openViaApi } from '../../api/download';
import { useDataTable } from '../../hooks/useDataTable';
import { usePermissions } from '../../hooks/usePermissions';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import DataTable from '../../components/common/DataTable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatDateDMY } from '../../utils/date';
import { EditIcon, PlusIcon, PrinterIcon, SpinnerIcon, TrashIcon } from '../../components/common/Icons';

const STATUS_OPTIONS = ['Pending', 'Paid', 'Cancelled'];

const paymentBadge = (status) => ({
  'Full Payment': 'badge-success',
  'Partial Payment': 'badge-warning',
  Due: 'badge-danger',
}[status] || 'badge-neutral');

const statusClass = (status) => ({
  Paid: 'is-paid',
  Pending: 'is-pending',
  Cancelled: 'is-cancelled',
}[status] || '');

export default function ManageInvoice() {
  const can = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const table = useDataTable(invoicesApi.list, { defaultSort: 'invoice_date', defaultDir: 'desc' });

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [printingId, setPrintingId] = useState(null);
  const [currency, setCurrency] = useState('SGD');

  useEffect(() => {
    settingsApi.get()
      .then((res) => setCurrency(res.data?.default_currency || 'SGD'))
      .catch(() => {});
  }, []);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await invoicesApi.remove(toDelete.id);
      toast.success(`Invoice #${toDelete.invoice_no} deleted`);
      setToDelete(null);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this invoice'));
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (row, status) => {
    try {
      await invoicesApi.patchStatus(row.id, status);
      toast.success(`Invoice #${row.invoice_no} marked ${status}`);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the status'));
    }
  };

  const handlePrint = async (row) => {
    setPrintingId(row.id);
    try {
      await openViaApi(`/invoices/${row.id}/print`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate the PDF'));
    } finally {
      setPrintingId(null);
    }
  };

  const columns = [
    { key: '#', label: '#', render: (_r, serial) => <span className="num text-muted">{serial}</span> },
    {
      key: 'invoice_no', label: 'Invoice', sortable: true,
      render: (r) => <span className="cell-strong">#{r.invoice_no}</span>,
    },
    {
      key: 'invoice_date', label: 'Invoice Date', sortable: true,
      render: (r) => <span className="num">{formatDateDMY(r.invoice_date)}</span>,
    },
    { key: 'companyname', label: 'Company name', render: (r) => <span className="cell-strong">{r.companyname}</span> },
    { key: 'customer_contact', label: 'Contact', render: (r) => <span className="num">{r.customer_contact || '—'}</span> },
    {
      key: 'due_amount', label: 'Due', sortable: true, align: 'right',
      render: (r) => (
        <span className="num" style={{ color: Number(r.due_amount) > 0 ? 'var(--red)' : 'var(--muted)', fontWeight: 600 }}>
          {Number(r.due_amount).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'sub_amount', label: `Total (${currency})`, sortable: true, align: 'right',
      render: (r) => <span className="num cell-strong">{Number(r.sub_amount).toFixed(2)}</span>,
    },
    {
      key: 'payment_status', label: 'Payment Status',
      render: (r) => <span className={`badge ${paymentBadge(r.payment_status)}`}>{r.payment_status || '—'}</span>,
    },
    {
      key: 'status', label: 'Status',
      render: (row) => (can('invoices.edit') ? (
        <select
          className={`status-select ${statusClass(row.status)}`}
          value={row.status || 'Pending'}
          onChange={(e) => handleStatusChange(row, e.target.value)}
          aria-label={`Status for invoice ${row.invoice_no}`}
        >
          {STATUS_OPTIONS.map((sVal) => <option key={sVal} value={sVal}>{sVal}</option>)}
        </select>
      ) : (
        <span className="badge badge-info">{row.status}</span>
      )),
    },
    {
      key: 'action', label: 'Action',
      render: (row) => (
        <div className="row-actions">
          {can('invoices.edit') && (
            <button className="btn-icon icon-edit-orange" title="Edit invoice" onClick={() => navigate(`/invoices/${row.id}/edit`)}>
              <EditIcon width={15} height={15} />
            </button>
          )}
          {can('invoices.print') && (
            <button className="btn-icon icon-print" title="Print / download PDF"
              disabled={printingId === row.id} onClick={() => handlePrint(row)}>
              {printingId === row.id ? <SpinnerIcon width={15} height={15} /> : <PrinterIcon width={15} height={15} />}
            </button>
          )}
          {can('invoices.delete') && (
            <button className="btn-icon icon-delete" title="Delete invoice" onClick={() => setToDelete(row)}>
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
          <div className="eyebrow">Invoice</div>
          <h1>Manage Invoice</h1>
        </div>
        {can('invoices.create') && (
          <Link className="btn btn-primary" to="/invoices/add">
            <PlusIcon width={15} height={15} /> Add Invoice
          </Link>
        )}
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          {...table}
          searchPlaceholder="Search invoice no, company, contact…"
          emptyTitle="No invoices yet"
          emptyMessage="Raise your first invoice and it will appear here."
        />
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        busy={deleting}
        title="Delete invoice?"
        message={`Invoice #${toDelete?.invoice_no} for ${toDelete?.companyname} will be permanently deleted, along with its line items.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
