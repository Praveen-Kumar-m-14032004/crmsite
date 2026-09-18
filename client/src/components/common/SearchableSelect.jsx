import { useEffect, useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function SearchableSelect({
  id,
  options = [],
  value = '',
  onChange,
  placeholder = 'Select product…',
  required = false,
  disabled = false,
  allowCustom = true,
  className = '',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, maxHeight: 260, openUp: false });

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const optionsListRef = useRef([]);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const displayValue = selected ? selected.label : (value ? String(value) : '');

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

  // Keep query synced with selected option or custom value when closed
  useEffect(() => {
    if (!open) {
      setQuery(displayValue);
    }
  }, [displayValue, open]);

  // Calculate coordinates for portal rendering
  const updatePosition = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const menuDesiredHeight = 260;

    // Flip upwards if space below is too tight and space above is larger
    const openUp = spaceBelow < menuDesiredHeight && spaceAbove > spaceBelow;

    // Dynamic width: match input but allow expanding up to min 280px for long product names
    const minW = Math.max(rect.width, 280);
    const width = Math.min(minW, viewportWidth - 24);

    let left = rect.left;
    if (left + width > viewportWidth - 12) {
      left = viewportWidth - width - 12;
    }
    if (left < 12) left = 12;

    const maxHeight = Math.max(120, Math.min(menuDesiredHeight, (openUp ? spaceAbove : spaceBelow) - 16));

    setDropdownPos({
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? viewportHeight - rect.top + 4 : undefined,
      left,
      width,
      maxHeight,
      openUp,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open, updatePosition]);

  const handleSelect = (val) => {
    onChange?.(val);
    const opt = options.find((o) => String(o.value) === String(val));
    setQuery(opt?.label || String(val) || '');
    setOpen(false);
  };

  const commitSelection = (text) => {
    const q = (text !== undefined ? text : query).trim();
    if (!q) {
      onChange?.('');
      setQuery('');
      setOpen(false);
      return;
    }
    const qLower = q.toLowerCase();
    // 1. Exact label match (case-insensitive)
    const exact = options.find((o) => o.label.trim().toLowerCase() === qLower);
    if (exact) {
      handleSelect(exact.value);
      return;
    }
    // 2. Exact value match (e.g. ID)
    const exactVal = options.find((o) => String(o.value).toLowerCase() === qLower);
    if (exactVal) {
      handleSelect(exactVal.value);
      return;
    }
    // 3. Prefix match
    const prefix = options.find((o) => o.label.trim().toLowerCase().startsWith(qLower));
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
    // 5. Allow custom typed value
    if (allowCustom) {
      handleSelect(q);
      return;
    }
    // 6. If no match at all and not allowCustom, revert to previously selected or clear
    if (selected) {
      setQuery(selected.label);
    } else {
      onChange?.('');
      setQuery('');
    }
    setOpen(false);
  };

  useEffect(() => {
    const handleDocClick = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        if (open) {
          commitSelection();
        }
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open, query, options, filtered, selected, highlightIdx, allowCustom]);

  const handleClear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange?.('');
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
        const nextIdx = highlightIdx + 1 < filtered.length ? highlightIdx + 1 : 0;
        setHighlightIdx(nextIdx);
        optionsListRef.current[nextIdx]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        const prevIdx = highlightIdx - 1 >= 0 ? highlightIdx - 1 : filtered.length - 1;
        setHighlightIdx(prevIdx);
        optionsListRef.current[prevIdx]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault();
        commitSelection();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(displayValue);
    } else if (e.key === 'Tab') {
      if (open) {
        commitSelection();
      }
    }
  };

  const showCustomOption = allowCustom && query.trim() && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className={`ss-wrap${open ? ' ss-is-open' : ''} ${className}`.trim()} ref={wrapRef}>
      <div className="ss-input-wrap">
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          title={!open ? displayValue : ''}
          value={open ? query : displayValue}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery(displayValue);
            setTimeout(() => inputRef.current?.select(), 0);
          }}
          onKeyDown={handleKeyDown}
          required={required && !value}
        />
        <div className="ss-actions">
          {Boolean(value || query) && !disabled && (
            <button
              type="button"
              className="ss-clear"
              onClick={handleClear}
              tabIndex={-1}
              title="Clear selection"
              aria-label="Clear"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className={`ss-arrow${open ? ' ss-open' : ''}`}
            tabIndex={-1}
            aria-label="Toggle dropdown"
            onClick={(e) => {
              e.preventDefault();
              if (disabled) return;
              if (open) {
                commitSelection();
              } else {
                setOpen(true);
                setQuery(displayValue);
                inputRef.current?.focus();
              }
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className={`ss-dropdown${dropdownPos.openUp ? ' ss-open-up' : ''}`}
          role="listbox"
          style={{
            position: 'fixed',
            top: dropdownPos.top !== undefined ? `${dropdownPos.top}px` : undefined,
            bottom: dropdownPos.bottom !== undefined ? `${dropdownPos.bottom}px` : undefined,
            left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
            maxHeight: `${dropdownPos.maxHeight}px`,
            zIndex: 99999,
          }}
        >
          {filtered.length === 0 && !showCustomOption ? (
            <div className="ss-empty">No matches found</div>
          ) : (
            <>
              {filtered.map((o, idx) => {
                const isSelected = String(o.value) === String(value);
                const isHighlighted = idx === highlightIdx;
                return (
                  <div
                    key={String(o.value) + idx}
                    ref={(el) => (optionsListRef.current[idx] = el)}
                    className={`ss-option${isSelected ? ' ss-active' : ''}${isHighlighted ? ' ss-highlighted' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(o.value);
                    }}
                    onMouseEnter={() => setHighlightIdx(idx)}
                  >
                    <div className="ss-option-body">
                      <div className="ss-option-label">{o.label}</div>
                      {o.sub && <div className="ss-option-sub">{o.sub}</div>}
                    </div>
                    {isSelected && (
                      <span className="ss-check" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </div>
                );
              })}
              {showCustomOption && (
                <div
                  className="ss-option ss-option-custom"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(query.trim());
                  }}
                >
                  <span className="ss-custom-plus">➕</span>
                  <div className="ss-option-body">
                    <div className="ss-option-label">Use “{query.trim()}”</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
