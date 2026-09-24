import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { quotationsApi } from '../../api/endpoints';
import { useDataTable } from '../../hooks/useDataTable';
import { usePermissions } from '../../hooks/usePermissions';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import {
  DownloadIcon,
  EditIcon,
  EyeIcon,
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
  const [downloadingId, setDownloadingId] = useState(null);

  const fetcher = useCallback((params) => {
    return quotationsApi.list(params);
  }, []);

  const table = useDataTable(fetcher, { defaultSort: 'id', defaultDir: 'desc' });

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await quotationsApi.remove(toDelete.id);
      toast.success(`Quotation ${toDelete.quotation_no || ''} deleted`);
      setToDelete(null);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete quotation'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadPdf = async (q, e) => {
    e.stopPropagation();
    setDownloadingId(q.id);
    try {
      window.open(quotationsApi.pdfUrl(q.id), '_blank');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to download PDF'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="quotation-page-container">
      {/* Breadcrumb matching target Aula CRM */}
      <div className="page-breadcrumb" style={{ marginBottom: 18, fontSize: 15, fontWeight: 500, color: 'var(--muted)' }}>
        Table / <span style={{ color: '#e0287a', fontWeight: 600 }}>estimate</span>
      </div>

      <div className="card" style={{ padding: '24px 28px', borderRadius: 16 }}>
        {/* Card Header with Add Quotation Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          {can('quotations.create', 'invoices.create') && (
            <Link
              to="/estimates/add"
              className="btn-add-quotation"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, #c026d3 0%, #a21caf 50%, #86198f 100%)',
                color: '#ffffff',
                padding: '10px 22px',
                borderRadius: 9999,
                fontWeight: 600,
                fontSize: 14,
                boxShadow: '0 4px 14px rgba(162, 28, 175, 0.35)',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <PlusIcon size={16} strokeWidth={3} />
              Add Quotation
            </Link>
          )}
        </div>

        {/* Search & Page Size controls matching target layout */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13.5 }}>
            <span>Show</span>
            <select
              value={table.limit}
              onChange={(e) => table.setLimit(Number(e.target.value))}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: '#fff',
                color: 'var(--ink)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>entries</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13.5 }}>
            <label htmlFor="quote-search">Search:</label>
            <input
              id="quote-search"
              type="search"
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder=""
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                fontSize: 13,
                minWidth: 180,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="table-responsive" style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13.5,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--line)', color: 'var(--ink-2)', fontWeight: 600 }}>
                <th style={{ padding: '12px 14px', width: 70 }}>
                  <button
                    type="button"
                    onClick={() => table.toggleSort('id')}
                    style={{ background: 'none', border: 'none', font: 'inherit', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    S.No <span>↕</span>
                  </button>
                </th>
                <th style={{ padding: '12px 14px' }}>
                  <button
                    type="button"
                    onClick={() => table.toggleSort('quotation_no')}
                    style={{ background: 'none', border: 'none', font: 'inherit', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    Quotation ID <span>↕</span>
                  </button>
                </th>
                <th style={{ padding: '12px 14px' }}>
                  <button
                    type="button"
                    onClick={() => table.toggleSort('companyname')}
                    style={{ background: 'none', border: 'none', font: 'inherit', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    Company Name <span>↕</span>
                  </button>
                </th>
                <th style={{ padding: '12px 14px' }}>
                  <button
                    type="button"
                    onClick={() => table.toggleSort('mobile_no')}
                    style={{ background: 'none', border: 'none', font: 'inherit', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    Phone Number <span>↕</span>
                  </button>
                </th>
                <th style={{ padding: '12px 14px', textAlign: 'right', width: 140 }}>
                  Action <span>↕</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '36px 0', textAlign: 'center', color: 'var(--muted)' }}>
                    <SpinnerIcon size={24} />
                    <div style={{ marginTop: 8 }}>Loading quotations...</div>
                  </td>
                </tr>
              ) : table.data.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '36px 0', textAlign: 'center', color: 'var(--muted)' }}>
                    No quotations found.
                  </td>
                </tr>
              ) : (
                table.data.map((row, index) => {
                  const sNo = (table.page - 1) * table.limit + index + 1;
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid var(--line-soft)',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--canvas)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '14px 14px', color: 'var(--muted)' }}>{sNo}</td>
                      <td style={{ padding: '14px 14px', fontWeight: 600, color: 'var(--purple-brand)' }}>
                        <Link
                          to={`/estimates/${row.id}`}
                          style={{ color: 'inherit', textDecoration: 'none' }}
                          title="View quotation"
                        >
                          {row.quotation_no}
                        </Link>
                      </td>
                      <td style={{ padding: '14px 14px', fontWeight: 500 }}>{row.companyname}</td>
                      <td style={{ padding: '14px 14px', color: 'var(--ink-2)' }}>{row.mobile_no || '—'}</td>
                      <td style={{ padding: '14px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          {/* View Button (Purple Circle Icon Button) */}
                          <Link
                            to={`/estimates/${row.id}`}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: '50%',
                              backgroundColor: '#a21caf',
                              color: '#fff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textDecoration: 'none',
                              boxShadow: '0 2px 6px rgba(162, 28, 175, 0.25)',
                              transition: 'transform 0.15s ease',
                            }}
                            title="View Quotation"
                          >
                            <EyeIcon size={14} />
                          </Link>

                          {/* Edit Button (Indigo/Purple Circle Icon Button) */}
                          {can('quotations.edit', 'invoices.edit') && (
                            <Link
                              to={`/estimates/${row.id}/edit`}
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: '50%',
                                backgroundColor: '#6366f1',
                                color: '#fff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textDecoration: 'none',
                                boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)',
                                transition: 'transform 0.15s ease',
                              }}
                              title="Edit Quotation"
                            >
                              <EditIcon size={14} />
                            </Link>
                          )}

                          {/* Delete Button (Red Circle Icon Button) */}
                          {can('quotations.delete', 'invoices.delete') && (
                            <button
                              type="button"
                              onClick={() => setToDelete(row)}
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: '50%',
                                backgroundColor: '#ef4444',
                                color: '#fff',
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(239, 68, 68, 0.25)',
                                transition: 'transform 0.15s ease',
                              }}
                              title="Delete Quotation"
                            >
                              <TrashIcon size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls matching Aula CRM */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 20,
            flexWrap: 'wrap',
            gap: 12,
            fontSize: 13,
            color: 'var(--muted)',
          }}
        >
          <div>
            Showing {table.total === 0 ? 0 : (table.page - 1) * table.limit + 1} to{' '}
            {Math.min(table.page * table.limit, table.total)} of {table.total} entries
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              disabled={table.page <= 1}
              onClick={() => table.setPage(table.page - 1)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: '#f8fafc',
                color: table.page <= 1 ? '#cbd5e1' : 'var(--ink)',
                cursor: table.page <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              «
            </button>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: '#fff',
                color: 'var(--purple-brand)',
                fontWeight: 700,
              }}
            >
              {table.page}
            </span>
            <button
              type="button"
              disabled={table.page * table.limit >= table.total}
              onClick={() => table.setPage(table.page + 1)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: '#f8fafc',
                color: table.page * table.limit >= table.total ? '#cbd5e1' : 'var(--ink)',
                cursor: table.page * table.limit >= table.total ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              »
            </button>
          </div>
        </div>
      </div>

      {toDelete && (
        <ConfirmDialog
          open={Boolean(toDelete)}
          title="Delete Quotation"
          message={`Are you sure you want to delete quotation "${toDelete.quotation_no}" for ${toDelete.companyname}?`}
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
