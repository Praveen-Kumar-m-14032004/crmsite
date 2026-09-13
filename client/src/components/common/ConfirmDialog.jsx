import { useEffect } from 'react';
import { SpinnerIcon, TrashIcon } from './Icons';

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <span className="dialog-icon danger"><TrashIcon width={21} height={21} /></span>
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>{title}</h3>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{message}</p>
        <div className="form-actions">
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? <><SpinnerIcon width={15} height={15} /> Deleting…</> : confirmLabel}
          </button>
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
