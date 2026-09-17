import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { invoicesApi, settingsApi } from '../../api/endpoints';
import { openViaApi } from '../../api/download';
import { useDataTable } from '../../hooks/useDataTable';
import { usePermissions } from '../../hooks/usePermissions';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import DataTable from '../../components/common/DataTable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatDateDMY } from '../../utils/date';
import {
  AlertIcon,
  EditIcon,
  PlusIcon,
  PrinterIcon,
  RestoreIcon,
  SpinnerIcon,
  TrashIcon,
} from '../../components/common/Icons';

const STATUS_OPTIONS = ['Unpaid', 'Paid', 'Cancelled'];

const statusClass = (status) => ({
  Paid: 'is-paid',
  Unpaid: 'is-pending',
  Pending: 'is-pending',
  Cancelled: 'is-cancelled',
}[status] || '');

export default function ManageInvoice() {
  const can = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const isTrashRoute = location.pathname.includes('/trash');
  const [activeTab, setActiveTab] = useState(isTrashRoute ? 'trash' : 'active');
  const activeTabRef = useRef(isTrashRoute ? 'trash' : 'active');
  activeTabRef.current = activeTab;

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [currency, setCurrency] = useState('SGD');
  const [counts, setCounts] = useState({ activeCount: 0, trashCount: 0 });

  const fetcher = useCallback((params) => {
    return invoicesApi.list({ ...params, trash: activeTabRef.current === 'trash' })
      .then((res) => {
        if (res.data?.meta) {
          setCounts(res.data.meta);
        }
        return res;
      });
  }, []);

  const table = useDataTable(fetcher, { defaultSort: 'invoice_date', defaultDir: 'desc' });

  useEffect(() => {
    const tab = location.pathname.includes('/trash') ? 'trash' : 'active';
    setActiveTab(tab);
    activeTabRef.current = tab;
    table.setPage(1);
    table.reload();
  }, [location.pathname]);

  useEffect(() => {
    settingsApi.get()
      .then((res) => setCurrency(res.data?.default_currency || 'SGD'))
      .catch(() => {});
  }, []);

  const handleTabSwitch = (tab) => {
    navigate(tab === 'trash' ? '/invoices/trash' : '/invoices');
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (activeTab === 'trash') {
        await invoicesApi.permanentDelete(toDelete.id);
        toast.success(`Invoice #${toDelete.invoice_no} permanently deleted`);
      } else {
        await invoicesApi.remove(toDelete.id);
        toast.success(`Invoice #${toDelete.invoice_no} moved to trash (auto-deletes in 10 days)`);
      }
      setToDelete(null);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not complete deletion'));
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async (row) => {
    setRestoringId(row.id);
    try {
      await invoicesApi.restore(row.id);
      toast.success(`Invoice #${row.invoice_no} restored to active invoices`);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not restore this invoice'));
    } finally {
      setRestoringId(null);
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

  // Active columns
  const activeColumns = [
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
      key: 'sub_amount', label: `Total (${currency})`, sortable: true, align: 'right',
      render: (r) => <span className="num cell-strong">{Number(r.sub_amount).toFixed(2)}</span>,
    },
  
    {
      key: 'action', label: 'Action',
      render: (row) => (
        <div className="row-actions">
           {can('invoices.print') && (
            <button className="btn-icon icon-print" title="Print / download PDF"
              disabled={printingId === row.id} onClick={() => handlePrint(row)}>
              {printingId === row.id ? <SpinnerIcon width={15} height={15} /> : <PrinterIcon width={15} height={15} />}
            </button>
          )}
          {can('invoices.edit') && (
            <button className="btn-icon icon-edit-orange" title="Edit invoice" onClick={() => navigate(`/invoices/${row.id}/edit`)}>
              <EditIcon width={15} height={15} />
            </button>
          )}
          {can('invoices.delete') && (
            <button className="btn-icon icon-delete" title="Move to trash" onClick={() => setToDelete(row)}>
              <TrashIcon width={15} height={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  // Trash columns
  const trashColumns = [
    { key: '#', label: '#', render: (_r, serial) => <span className="num text-muted">{serial}</span> },
    {
      key: 'invoice_no', label: 'Invoice', sortable: true,
      render: (r) => <span className="cell-strong">#{r.invoice_no}</span>,
    },
    { key: 'companyname', label: 'Company name', render: (r) => <span className="cell-strong">{r.companyname}</span> },
    {
      key: 'deleted_at', label: 'Deleted On', sortable: true,
      render: (r) => <span className="num">{formatDateDMY(r.deleted_at)}</span>,
    },
    {
      key: 'days_left', label: 'Auto-Deletes In',
      render: (r) => {
        const days = r.days_left !== undefined ? r.days_left : 10;
        const isUrgent = days <= 2;
        return (
          <span className={`badge ${isUrgent ? 'badge-danger' : 'badge-warning'}`}>
            {days === 0 ? 'Expiring today' : `${days} day${days === 1 ? '' : 's'} left`}
          </span>
        );
      },
    },
    {
      key: 'sub_amount', label: `Total (${currency})`, sortable: true, align: 'right',
      render: (r) => <span className="num cell-strong">{Number(r.sub_amount).toFixed(2)}</span>,
    },
    {
      key: 'action', label: 'Action',
      render: (row) => (
        <div className="row-actions">
          {can('invoices.delete') && (
            <>
              <button
                className="btn-icon icon-restore"
                title="Restore invoice to active list"
                disabled={restoringId === row.id}
                onClick={() => handleRestore(row)}
              >
                {restoringId === row.id ? <SpinnerIcon width={15} height={15} /> : <RestoreIcon width={15} height={15} />}
              </button>
              <button
                className="btn-icon icon-delete"
                title="Permanently delete invoice"
                onClick={() => setToDelete(row)}
              >
                <TrashIcon width={15} height={15} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">{isTrashRoute ? 'Invoice Trash' : 'Invoice'}</div>
          <h1>
            {isTrashRoute ? 'Trash Invoices' : 'Manage Invoices'}
            {isTrashRoute && counts.trashCount > 0 && (
              <span className="badge badge-danger" style={{ marginLeft: 12, verticalAlign: 'middle' }}>
                {counts.trashCount} in trash
              </span>
            )}
          </h1>
        </div>
        {!isTrashRoute && can('invoices.create') && (
          <Link className="btn btn-primary" to="/invoices/add">
            <PlusIcon width={15} height={15} /> Add Invoice
          </Link>
        )}
      </div>

      {isTrashRoute && (
        <div className="trash-banner">
          <AlertIcon width={17} height={17} style={{ color: 'var(--purple-600)', flexShrink: 0 }} />
          <div>
            <strong>Invoices in Trash are automatically deleted permanently after 10 days.</strong>
            {' '}Click the green restore icon on any invoice to return it to active invoices.
          </div>
        </div>
      )}

      <div className="card">
        <DataTable
          columns={isTrashRoute ? trashColumns : activeColumns}
          {...table}
          searchPlaceholder={isTrashRoute ? 'Search trash invoices…' : 'Search invoice no, company, contact…'}
          emptyTitle={isTrashRoute ? 'Trash is empty' : 'No invoices yet'}
          emptyMessage={
            isTrashRoute
              ? 'No invoices are currently in the trash.'
              : 'Raise your first invoice and it will appear here.'
          }
        />
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        busy={deleting}
        title={activeTab === 'trash' ? 'Permanently delete invoice?' : 'Move invoice to trash?'}
        message={
          activeTab === 'trash'
            ? `Invoice #${toDelete?.invoice_no} for ${toDelete?.companyname} and all its line items will be permanently erased. This action CANNOT be undone.`
            : `Invoice #${toDelete?.invoice_no} for ${toDelete?.companyname} will be moved to the Trash. You can restore it anytime within 10 days before it is automatically deleted.`
        }
        confirmText={activeTab === 'trash' ? 'Delete Permanently' : 'Move to Trash'}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
