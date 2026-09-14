import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productsApi } from '../../api/endpoints';
import { errorMessage, useToast } from '../../hooks/ToastContext';
import { SpinnerIcon } from '../../components/common/Icons';

export default function AddProduct() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [productname, setProductname] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    productsApi.get(id)
      .then((res) => setProductname(res.data.productname))
      .catch((err) => toast.error(errorMessage(err, 'Could not load this product')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await productsApi.update(id, { productname });
        toast.success('Product updated');
      } else {
        await productsApi.create({ productname });
        toast.success('Product added');
      }
      navigate('/products');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this product'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Product Name</div>
          <h1>{isEdit ? 'Edit Product' : 'Add product'}</h1>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/products')}>Back to list</button>
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        {loading ? (
          <div className="skeleton" style={{ height: 42 }} />
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="productname">Product Name <span className="req">*</span></label>
              <input
                id="productname"
                value={productname}
                onChange={(e) => setProductname(e.target.value)}
                placeholder="e.g. IMPORT DECLARATION"
                autoFocus
                required
              />
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? <><SpinnerIcon width={15} height={15} /> Saving…</> : isEdit ? 'Save changes' : 'Submit'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => navigate('/products')}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
