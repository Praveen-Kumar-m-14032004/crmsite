import { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchableSelect({
  id,
  options = [],
  value = '',
  onChange,
  placeholder = 'Search…',
  required = false,
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) || (o.sub && o.sub.toLowerCase().includes(q))
    );
  }, [options, query]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered.length]);

  // Keep query synced with selected option when closed
  useEffect(() => {
    if (!open) {
      setQuery(selected?.label || '');
    }
  }, [selected, open]);

  useEffect(() => {
    const handleDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        if (open) {
          if (query.trim()) {
            const exact = options.find((o) => o.label.toLowerCase() === query.trim().toLowerCase());
            if (exact) {
              onChange(exact.value);
            } else if (filtered.length === 1) {
              onChange(filtered[0].value);
            } else if (selected) {
              setQuery(selected.label);
            } else {
              setQuery('');
            }
          } else {
            onChange('');
            setQuery('');
          }
          setOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open, query, options, filtered, selected, onChange]);

  const handleSelect = (val) => {
    onChange(val);
    const opt = options.find((o) => String(o.value) === String(val));
    setQuery(opt?.label || '');
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        setHighlightIdx((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        setHighlightIdx((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
      }
    } else if (e.key === 'Enter') {
      if (open && filtered.length > 0) {
        e.preventDefault();
        const pick = filtered[highlightIdx] || filtered[0];
        handleSelect(pick.value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(selected?.label || '');
    } else if (e.key === 'Tab') {
      if (open && query.trim()) {
        const exact = options.find((o) => o.label.toLowerCase() === query.trim().toLowerCase());
        if (exact) {
          handleSelect(exact.value);
        } else if (filtered.length === 1) {
          handleSelect(filtered[0].value);
        }
      }
      setOpen(false);
    }
  };

  return (
    <div className="ss-wrap" ref={wrapRef}>
      <div className="ss-input-wrap">
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={open ? query : (selected?.label || '')}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery(selected?.label || '');
            inputRef.current?.select();
          }}
          onKeyDown={handleKeyDown}
          required={required && !value}
        />
        {value && !disabled && (
          <button type="button" className="ss-clear" onClick={handleClear} tabIndex={-1} title="Clear">
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="ss-dropdown" role="listbox">
          {filtered.length === 0 ? (
            <div className="ss-empty">No matches found</div>
          ) : (
            filtered.map((o, idx) => {
              const isSelected = String(o.value) === String(value);
              const isHighlighted = idx === highlightIdx;
              return (
                <div
                  key={String(o.value) + idx}
                  className={`ss-option${isSelected ? ' ss-active' : ''}${isHighlighted ? ' ss-highlighted' : ''}`}
                  onMouseDown={() => handleSelect(o.value)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                >
                  <div className="ss-option-label">{o.label}</div>
                  {o.sub && <div className="ss-option-sub">{o.sub}</div>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
