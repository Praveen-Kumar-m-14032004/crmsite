import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { productsApi } from '../../api/endpoints';
import { useDataTable } from '../../hooks/useDataTable';
import { usePermissions } from '../../hooks/usePermissions';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import DataTable from '../../components/common/DataTable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { EditIcon, PlusIcon, TrashIcon } from '../../components/common/Icons';

export default function ManageProduct() {
  const can = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const table = useDataTable(productsApi.list);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await productsApi.remove(toDelete.id);
      toast.success('Product deleted');
      setToDelete(null);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this product'));
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: '#', label: '#', render: (_r, serial) => <span className="num text-muted">{serial}</span> },
    { key: 'productname', label: 'Product Name', render: (r) => <span className="cell-strong">{r.productname}</span> },
    {
      key: 'action', label: 'Action',
      render: (row) => (
        <div className="row-actions">
          {can('products.edit') && (
            <button className="btn-icon icon-edit" title="Edit product" onClick={() => navigate(`/products/${row.id}/edit`)}>
              <EditIcon width={15} height={15} />
            </button>
          )}
          {can('products.delete') && (
            <button className="btn-icon icon-delete" title="Delete product" onClick={() => setToDelete(row)}>
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
          <div className="eyebrow">Product Name</div>
          <h1>Manage product</h1>
        </div>
        {can('products.create') && (
          <Link className="btn btn-primary" to="/products/add">
            <PlusIcon width={15} height={15} /> Add product
          </Link>
        )}
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          {...table}
          searchPlaceholder="Search products…"
          emptyTitle="No products yet"
          emptyMessage="Add the services you bill for, like Import Declaration."
        />
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        busy={deleting}
        title="Delete product?"
        message={`“${toDelete?.productname}” will be removed. Products used on existing invoices cannot be deleted.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
