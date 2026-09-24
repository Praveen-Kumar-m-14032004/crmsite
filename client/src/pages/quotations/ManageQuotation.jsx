import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { quotationsApi, settingsApi } from '../../api/endpoints';
import { openViaApi } from '../../api/download';
import { useDataTable } from '../../hooks/useDataTable';
import { usePermissions } from '../../hooks/usePermissions';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import DataTable from '../../components/common/DataTable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatDateDMY } from '../../utils/date';
import {
  EditIcon,
  PlusIcon,
  PrinterIcon,
  SpinnerIcon,
  TrashIcon,
} from '../../components/common/Icons';

export default function ManageQuotation() {
  const can = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [printingId, setPrintingId] = useState(null);
  const [currency, setCurrency] = useState('SGD');

  const fetcher = useCallback((params) => {
    return quotationsApi.list(params);
  }, []);

  const table = useDataTable(fetcher, { defaultSort: 'id', defaultDir: 'desc' });

  useEffect(() => {
    settingsApi.get()
      .then((res) => {
        if (res.data?.default_currency) {
          setCurrency(res.data.default_currency);
        }
      })
      .catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await quotationsApi.remove(toDelete.id);
      toast.success(`Quotation #${toDelete.quotation_no || ''} deleted`);
      setToDelete(null);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete quotation'));
    } finally {
      setDeleting(false);
    }
  };

  const handlePrint = useCallback(async (row) => {
    setPrintingId(row.id);
    try {
      await openViaApi(`/quotations/${row.id}/pdf`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate quotation PDF'));
    } finally {
      setPrintingId(null);
    }
  }, [toast]);

  const columns = useMemo(() => [
    {
      key: '#',
      label: '#',
      render: (_r, serial) => <span className="num text-muted">{serial}</span>,
    },
    {
      key: 'quotation_no',
      label: 'Quotation #',
      sortable: true,
      render: (r) => (
        <Link
          to={`/estimates/${r.id}`}
          className="cell-strong"
          style={{ color: 'var(--purple-brand)', textDecoration: 'none' }}
        >
          #{r.quotation_no}
        </Link>
      ),
    },
    {
      key: 'quotation_date',
      label: 'Date',
      sortable: true,
      render: (r) => <span className="num">{formatDateDMY(r.quotation_date || r.created_at)}</span>,
    },
    {
      key: 'companyname',
      label: 'Company name',
      sortable: true,
      render: (r) => <span className="cell-strong">{r.companyname}</span>,
    },
    {
      key: 'customer_contact',
      label: 'Contact',
      render: (r) => <span className="num">{r.customer_contact || r.mobile_no || '—'}</span>,
    },
    {
      key: 'sub_amount',
      label: `Total (${currency})`,
      sortable: true,
      align: 'right',
      render: (r) => <span className="num cell-strong">{Number(r.sub_amount || 0).toFixed(2)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="row-actions">
          <button
            type="button"
            className="btn-icon"
            title="Print Quotation"
            onClick={() => handlePrint(r)}
            disabled={printingId === r.id}
          >
            {printingId === r.id ? (
              <SpinnerIcon width={15} height={15} />
            ) : (
              <PrinterIcon width={15} height={15} />
            )}
          </button>

          {can('quotations.edit', 'invoices.edit') && (
            <Link
              to={`/estimates/${r.id}/edit`}
              className="btn-icon"
              title="Edit Quotation"
            >
              <EditIcon width={15} height={15} />
            </Link>
          )}

          {can('quotations.delete', 'invoices.delete') && (
            <button
              type="button"
              className="btn-icon icon-delete"
              title="Delete Quotation"
              onClick={() => setToDelete(r)}
            >
              <TrashIcon width={15} height={15} />
            </button>
          )}
        </div>
      ),
    },
  ], [currency, printingId, can, handlePrint]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Transactions</div>
          <h1>Manage Quotation</h1>
        </div>
        {can('quotations.create', 'invoices.create') && (
          <Link to="/estimates/add" className="btn btn-primary">
            <PlusIcon /> Add Quotation
          </Link>
        )}
      </div>
      <div className="card">
        <DataTable
          columns={columns}
          {...table}
          onSort={table.toggleSort}
          searchPlaceholder="Search quotation no, company, contact…"
          emptyTitle="No quotations yet"
          emptyMessage="Create your first quotation and it will appear here."
        />
      </div>

      {toDelete && (
        <ConfirmDialog
          open={Boolean(toDelete)}
          title="Delete Quotation"
          message={`Are you sure you want to delete quotation #${toDelete.quotation_no} for ${toDelete.companyname}?`}
          confirmLabel="Delete"
          destructive
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
