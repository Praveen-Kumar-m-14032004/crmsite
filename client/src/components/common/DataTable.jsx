import { InvoiceIcon, SearchIcon } from './Icons';

function Skeleton({ rows, cols }) {
  return Array.from({ length: rows }).map((_, r) => (
    <tr key={r}>
      {Array.from({ length: cols }).map((__, c) => (
        <td key={c}><div className="skeleton" style={{ width: c === 0 ? '35%' : `${55 + ((r + c) % 4) * 10}%` }} /></td>
      ))}
    </tr>
  ));
}

export default function DataTable({
  columns, data, loading, error,
  total, page, setPage, limit, setLimit,
  search, setSearch, sort, dir, onSort,
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'Records you add will show up in this list.',
  searchPlaceholder = 'Search…',
}) {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const startRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, total);

  const pages = [];
  const maxButtons = 5;
  let first = Math.max(1, page - Math.floor(maxButtons / 2));
  const last = Math.min(totalPages, first + maxButtons - 1);
  first = Math.max(1, last - maxButtons + 1);
  for (let p = first; p <= last; p += 1) pages.push(p);

  const isEmpty = !loading && data.length === 0;

  return (
    <div>
      <div className="datatable-toolbar">
        <div className="entries-select">
          <span>Show</span>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Rows per page">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>entries</span>
        </div>

        <div className="search-box">
          <SearchIcon />
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
          />
        </div>
      </div>

      {error && (
        <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>
      )}

      <div className="table-scroll">
        <table className="datatable">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={col.sortable ? 'sortable' : ''}
                  onClick={() => col.sortable && onSort(col.key)}
                  style={col.align ? { textAlign: col.align } : undefined}
                >
                  {col.label}
                  {col.sortable && (
                    <span className={`sort-ind ${sort === col.key ? 'on' : ''}`}>
                      {sort === col.key ? (dir === 'asc' ? '▲' : '▼') : '▲'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <Skeleton rows={Math.min(limit, 6)} cols={columns.length} />
            ) : isEmpty ? (
              <tr>
                <td colSpan={columns.length} style={{ borderBottom: 'none' }}>
                  <div className="empty-state">
                    <span className="empty-icon"><InvoiceIcon width={26} height={26} /></span>
                    <h4>{search ? 'No matches found' : emptyTitle}</h4>
                    <p>{search ? `Nothing matches “${search}”. Try a different search.` : emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr key={row.id ?? idx}>
                  {columns.map((col) => (
                    <td key={col.key} style={col.align ? { textAlign: col.align } : undefined}>
                      {col.render ? col.render(row, (page - 1) * limit + idx + 1) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="datatable-footer">
        <span>
          {total === 0 ? 'No entries to show' : `Showing ${startRow}–${endRow} of ${total} entries`}
        </span>
        {totalPages > 1 && (
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            {first > 1 && <button onClick={() => setPage(1)}>1</button>}
            {first > 2 && <button disabled>…</button>}
            {pages.map((p) => (
              <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>
            ))}
            {last < totalPages - 1 && <button disabled>…</button>}
            {last < totalPages && <button onClick={() => setPage(totalPages)}>{totalPages}</button>}
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
