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
    const q = query.toLowerCase().trim();
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) ||
      (o.sub && o.sub.toLowerCase().includes(q)) ||
      String(o.value).toLowerCase() === q
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

  const handleSelect = (val) => {
    onChange(val);
    const opt = options.find((o) => String(o.value) === String(val));
    setQuery(opt?.label || '');
    setOpen(false);
  };

  const commitSelection = (text) => {
    const q = (text !== undefined ? text : query).trim().toLowerCase();
    if (!q) {
      onChange('');
      setQuery('');
      setOpen(false);
      return;
    }
    // 1. Exact label match (case-insensitive)
    const exact = options.find((o) => o.label.trim().toLowerCase() === q);
    if (exact) {
      handleSelect(exact.value);
      return;
    }
    // 2. Exact value match (e.g. ID)
    const exactVal = options.find((o) => String(o.value).toLowerCase() === q);
    if (exactVal) {
      handleSelect(exactVal.value);
      return;
    }
    // 3. Prefix match
    const prefix = options.find((o) => o.label.trim().toLowerCase().startsWith(q));
    if (prefix) {
      handleSelect(prefix.value);
      return;
    }
    // 4. Any match in filtered
    if (filtered.length > 0) {
      const pick = filtered[highlightIdx] || filtered[0];
      handleSelect(pick.value);
      return;
    }
    // 5. If no match at all, revert to previously selected or clear
    if (selected) {
      setQuery(selected.label);
    } else {
      onChange('');
      setQuery('');
    }
    setOpen(false);
  };

  useEffect(() => {
    const handleDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        if (open) {
          commitSelection();
        }
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open, query, options, filtered, selected, highlightIdx]);

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
      if (open) {
        e.preventDefault();
        commitSelection();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(selected?.label || '');
    } else if (e.key === 'Tab') {
      if (open) {
        commitSelection();
      }
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
        <div className="ss-actions">
          {value && !disabled && (
            <button type="button" className="ss-clear" onClick={handleClear} tabIndex={-1} title="Clear">
              ×
            </button>
          )}
          <button
            type="button"
            className={`ss-arrow${open ? ' ss-open' : ''}`}
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();
              if (disabled) return;
              if (open) {
                commitSelection();
              } else {
                setOpen(true);
                setQuery(selected?.label || '');
                inputRef.current?.focus();
              }
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
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
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(o.value);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(o.value);
                  }}
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
