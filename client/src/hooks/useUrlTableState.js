import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function useUrlTableState(prefix, defaults = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const key = useCallback((name) => `${prefix}${name}`, [prefix]);

  const state = useMemo(() => {
    const search = searchParams.get(key('q')) ?? defaults.search ?? '';
    const activeFilter = searchParams.get(key('f')) ?? defaults.filter ?? 'all';
    const sortKey = searchParams.get(key('sk')) ?? defaults.sortKey ?? '';
    const sortDirection = searchParams.get(key('sd')) ?? defaults.sortDirection ?? 'asc';
    const page = toPositiveInt(searchParams.get(key('p')), defaults.page ?? 1);
    const pageSize = toPositiveInt(searchParams.get(key('ps')), defaults.pageSize ?? 20);

    return {
      search,
      activeFilter,
      sortKey,
      sortDirection,
      page,
      pageSize,
    };
  }, [defaults.filter, defaults.page, defaults.pageSize, defaults.search, defaults.sortDirection, defaults.sortKey, key, searchParams]);

  const updateParams = useCallback(
    (entries) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);

        Object.entries(entries).forEach(([paramKey, value]) => {
          if (value === '' || value == null) {
            next.delete(key(paramKey));
            return;
          }

          next.set(key(paramKey), String(value));
        });

        return next;
      }, { replace: true });
    },
    [key, setSearchParams]
  );

  const setSearch = useCallback(
    (value) => {
      updateParams({ q: value, p: 1 });
    },
    [updateParams]
  );

  const setActiveFilter = useCallback(
    (value) => {
      updateParams({ f: value === 'all' ? '' : value, p: 1 });
    },
    [updateParams]
  );

  const setSort = useCallback(
    (nextSortKey, nextSortDirection) => {
      updateParams({ sk: nextSortKey, sd: nextSortDirection, p: 1 });
    },
    [updateParams]
  );

  const setPage = useCallback(
    (value) => {
      updateParams({ p: value <= 1 ? '' : value });
    },
    [updateParams]
  );

  const setPageSize = useCallback(
    (value) => {
      updateParams({
        ps: value === (defaults.pageSize ?? 20) ? '' : value,
        p: 1,
      });
    },
    [defaults.pageSize, updateParams]
  );

  return {
    ...state,
    setSearch,
    setActiveFilter,
    setSort,
    setPage,
    setPageSize,
  };
}
