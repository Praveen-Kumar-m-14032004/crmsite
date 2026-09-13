import { useEffect } from 'react';
import { CloseIcon } from './Icons';

export default function Modal({ open, title, subtitle, onClose, children, width = 480 }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="card-sub" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close"><CloseIcon width={16} height={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
