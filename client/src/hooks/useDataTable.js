import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Search / sort / pagination state shared by every "Manage X" list screen.
 * Search is debounced so typing doesn't fire a request per keystroke, and a
 * filter change rewinds to page 1 without firing a throwaway request for the
 * page the user was previously on.
 */
export function useDataTable(fetcher, { defaultSort = null, defaultDir = 'desc', defaultLimit = 10 } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(defaultLimit);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState(defaultSort);
  const [dir, setDir] = useState(defaultDir);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const lastFilters = useRef({ q: '', limit: defaultLimit });

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const filtersChanged =
      lastFilters.current.q !== debouncedSearch || lastFilters.current.limit !== limit;

    // Rewind to the first page before fetching, otherwise a filter change would
    // request a page that may no longer exist in the narrowed result set.
    if (filtersChanged && page !== 1) {
      setPage(1);
      return undefined;
    }
    lastFilters.current = { q: debouncedSearch, limit };

    let active = true;
    setLoading(true);
    setError(null);

    const params = { search: debouncedSearch, page, limit };
    if (sort) { params.sort = sort; params.dir = dir; }

    fetcher(params)
      .then((res) => {
        if (!active) return;
        setData(res.data.data);
        setTotal(res.data.total);
      })
      .catch((err) => {
        if (!active) return;
        setData([]);
        setTotal(0);
        setError(err.response?.data?.message || 'Could not load this list. Is the API running?');
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, page, limit, sort, dir, reloadTick]);

  const toggleSort = (col) => {
    if (sort === col) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      setDir('asc');
    }
    setPage(1);
  };

  return {
    data, total, page, setPage, limit, setLimit, search, setSearch,
    sort, dir, toggleSort, loading, error, reload,
  };
}
