import { useMemo, useState } from 'react';

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function useTableControls(rows, options = {}) {
  const {
    searchable = [],
    sorters = {},
    initialSort = { key: '', direction: 'asc' },
    filter = null,
    state = null,
    remote = false,
  } = options;

  const [internalSearch, setInternalSearch] = useState('');
  const [internalSortKey, setInternalSortKey] = useState(initialSort.key);
  const [internalSortDirection, setInternalSortDirection] = useState(initialSort.direction || 'asc');
  const [internalActiveFilter, setInternalActiveFilter] = useState('all');

  const search = state?.search ?? internalSearch;
  const setSearch = state?.setSearch ?? setInternalSearch;
  const sortKey = state?.sortKey ?? internalSortKey;
  const setSortKey = state?.setSortKey ?? setInternalSortKey;
  const sortDirection = state?.sortDirection ?? internalSortDirection;
  const setSortDirection = state?.setSortDirection ?? setInternalSortDirection;
  const activeFilter = state?.activeFilter ?? internalActiveFilter;
  const setActiveFilter = state?.setActiveFilter ?? setInternalActiveFilter;
  const setSort = state?.setSort ?? null;

  const processedRows = useMemo(() => {
    if (remote) {
      return rows;
    }

    const query = search.trim().toLowerCase();

    let nextRows = [...rows];

    if (query) {
      nextRows = nextRows.filter((row) => {
        return searchable.some((selector) => {
          const value = typeof selector === 'function' ? selector(row) : row[selector];
          return String(value ?? '').toLowerCase().includes(query);
        });
      });
    }

    if (filter) {
      nextRows = nextRows.filter((row) => filter(row, activeFilter));
    }

    if (!sortKey || !sorters[sortKey]) {
      return nextRows;
    }

    const getter = sorters[sortKey];
    nextRows.sort((left, right) => {
      const leftValue = getter(left);
      const rightValue = getter(right);
      const result = compareValues(leftValue, rightValue);
      return sortDirection === 'asc' ? result : -result;
    });

    return nextRows;
  }, [activeFilter, filter, rows, search, sortDirection, sortKey, searchable, sorters]);

  function toggleSort(key) {
    const nextDirection = sortKey !== key ? 'asc' : sortDirection === 'asc' ? 'desc' : 'asc';

    if (setSort) {
      setSort(key, nextDirection);
      return;
    }

    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection('asc');
      return;
    }

    setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
  }

  function sortIndicator(key) {
    if (sortKey !== key) {
      return '';
    }
    return sortDirection === 'asc' ? '▲' : '▼';
  }

  return {
    rows: processedRows,
    search,
    setSearch,
    activeFilter,
    setActiveFilter,
    toggleSort,
    sortIndicator,
  };
}
