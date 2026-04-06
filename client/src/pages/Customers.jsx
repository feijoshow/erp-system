import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PaginationControls from '../components/ui/PaginationControls';
import { useToast } from '../components/ui/ToastProvider';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTableControls } from '../hooks/useTableControls';
import { useUrlTableState } from '../hooks/useUrlTableState';

const initialForm = { fullName: '', email: '', phone: '' };

function validateCustomerForm(form) {
  const errors = {};

  if (!form.fullName.trim()) {
    errors.fullName = 'Full name is required.';
  }

  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (form.phone && form.phone.trim().length < 6) {
    errors.phone = 'Phone number should be at least 6 characters.';
  }

  return errors;
}

export default function Customers() {
  const { getAccessToken, hasRole } = useAuth();
  const toast = useToast();
  const canCreate = hasRole('sales', 'admin');
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [signalsById, setSignalsById] = useState({});
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  const tableState = useUrlTableState('c_', {
    sortKey: 'name',
    sortDirection: 'asc',
    page: 1,
    pageSize: 20,
  });
  const debouncedSearch = useDebouncedValue(tableState.search, 350);

  const table = useTableControls(customers, {
    searchable: ['full_name', 'email', 'phone'],
    sorters: {
      name: (row) => row.full_name,
      email: (row) => row.email,
      phone: (row) => row.phone,
    },
    state: {
      search: tableState.search,
      setSearch: tableState.setSearch,
      activeFilter: tableState.activeFilter,
      setActiveFilter: tableState.setActiveFilter,
      sortKey: tableState.sortKey,
      sortDirection: tableState.sortDirection,
      setSort: tableState.setSort,
    },
    remote: true,
  });

  async function loadCustomers() {
    setLoading(true);
    setError('');
    try {
      const token = await getAccessToken();
      const payload = await api.getCustomers(token, {
        page: tableState.page,
        pageSize: tableState.pageSize,
        q: debouncedSearch,
        sortBy: tableState.sortKey || 'created_at',
        sortDir: tableState.sortDirection || 'desc',
      });
      setCustomers(payload.data || []);
      setMeta(payload.meta || { page: tableState.page, pageSize: tableState.pageSize, total: 0, totalPages: 1 });
    } catch (nextError) {
      setError(nextError.message || 'Unable to load customers.');
      toast.error(nextError.message || 'Unable to load customers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers().catch(console.error);
  }, [
    getAccessToken,
    tableState.page,
    tableState.pageSize,
    debouncedSearch,
    tableState.sortKey,
    tableState.sortDirection,
  ]);

  useEffect(() => {
    const missingIds = customers
      .map((customer) => customer.id)
      .filter((id) => id && !String(id).startsWith('temp-') && !signalsById[id]);

    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;

    async function loadSignals() {
      setSignalsLoading(true);
      try {
        const token = await getAccessToken();
        const results = await Promise.all(
          missingIds.map(async (customerId) => {
            try {
              const payload = await api.getCustomerProfile(token, customerId);
              return {
                customerId,
                signal: {
                  segment: payload.data?.segment || 'Standard',
                  riskFlag: payload.data?.risk?.flag || 'low',
                  riskScore: Number(payload.data?.risk?.score || 0),
                },
              };
            } catch (_error) {
              return {
                customerId,
                signal: {
                  segment: 'Standard',
                  riskFlag: 'low',
                  riskScore: 0,
                },
              };
            }
          })
        );

        if (cancelled) {
          return;
        }

        setSignalsById((current) => {
          const next = { ...current };
          results.forEach((result) => {
            next[result.customerId] = result.signal;
          });
          return next;
        });
      } finally {
        if (!cancelled) {
          setSignalsLoading(false);
        }
      }
    }

    loadSignals().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [customers, getAccessToken, signalsById]);

  function segmentClass(segment) {
    if (segment === 'VIP') return 'status-badge customer-segment-vip';
    if (segment === 'Watchlist') return 'status-badge customer-segment-watchlist';
    return 'status-badge customer-segment-standard';
  }

  function riskClass(flag) {
    if (flag === 'high') return 'status-badge customer-risk-high';
    if (flag === 'medium') return 'status-badge customer-risk-medium';
    return 'status-badge customer-risk-low';
  }

  async function handleCreate(event) {
    event.preventDefault();

    const errors = validateCustomerForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSaving(true);
    setError('');

    const optimisticId = `temp-${Date.now()}`;
    const optimisticRow = {
      id: optimisticId,
      full_name: form.fullName.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    };

    if (tableState.page === 1) {
      setCustomers((current) => [optimisticRow, ...current].slice(0, tableState.pageSize));
    }
    setMeta((current) => ({ ...current, total: current.total + 1 }));
    setForm(initialForm);

    try {
      const token = await getAccessToken();
      const payload = await api.createCustomer(token, {
        fullName: optimisticRow.full_name,
        email: optimisticRow.email,
        phone: optimisticRow.phone,
      });

      setCustomers((current) =>
        current.map((row) => (row.id === optimisticId ? (payload.data || row) : row))
      );
      if (tableState.page !== 1) {
        await loadCustomers();
      }
      toast.success('Customer added successfully.');
    } catch (nextError) {
      setCustomers((current) => current.filter((row) => row.id !== optimisticId));
      setMeta((current) => ({ ...current, total: Math.max(current.total - 1, 0) }));
      setError(nextError.message || 'Unable to create customer.');
      toast.error(nextError.message || 'Unable to create customer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <h1>Customers</h1>
      {error ? <p className="status">{error}</p> : null}

      {canCreate ? (
        <form className="card grid grid-3" onSubmit={handleCreate}>
        <input
          placeholder="Full name"
          value={form.fullName}
          onChange={(event) => {
            setForm((current) => ({ ...current, fullName: event.target.value }));
            setFormErrors((current) => ({ ...current, fullName: '' }));
          }}
          required
        />
        {formErrors.fullName ? <p className="status">{formErrors.fullName}</p> : null}
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(event) => {
            setForm((current) => ({ ...current, email: event.target.value }));
            setFormErrors((current) => ({ ...current, email: '' }));
          }}
        />
        {formErrors.email ? <p className="status">{formErrors.email}</p> : null}
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(event) => {
            setForm((current) => ({ ...current, phone: event.target.value }));
            setFormErrors((current) => ({ ...current, phone: '' }));
          }}
        />
        {formErrors.phone ? <p className="status">{formErrors.phone}</p> : null}
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Add customer'}
        </button>
        </form>
      ) : (
        <p className="muted">Only sales and admin roles can add customers.</p>
      )}

      <section className="card table-card">
        {loading ? <div className="table-fetch-bar" aria-hidden="true" /> : null}
        <div className="table-controls">
          <input
            type="search"
            value={table.search}
            placeholder="Search customers"
            onChange={(event) => table.setSearch(event.target.value)}
          />
          {signalsLoading ? <p className="muted">Refreshing customer intelligence...</p> : null}
        </div>
        {loading ? <p className="muted">Loading customers...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('name')}>
                  Name <span className="sort-icon">{table.sortIndicator('name')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('email')}>
                  Email <span className="sort-icon">{table.sortIndicator('email')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('phone')}>
                  Phone <span className="sort-icon">{table.sortIndicator('phone')}</span>
                </button>
              </th>
              <th>Segment</th>
              <th>Profile</th>
            </tr>
          </thead>
          <tbody>
            {!loading && table.rows.length === 0 ? (
              <tr>
                <td colSpan="5" className="muted">
                  No customers yet.
                </td>
              </tr>
            ) : null}
            {table.rows.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.full_name}</td>
                <td>{customer.email || '-'}</td>
                <td>{customer.phone || '-'}</td>
                <td>
                  <div className="customer-segment-cell">
                    <span className={segmentClass(signalsById[customer.id]?.segment || 'Standard')}>
                      {signalsById[customer.id]?.segment || 'Standard'}
                    </span>
                    <span className={riskClass(signalsById[customer.id]?.riskFlag || 'low')}>
                      Risk {String(signalsById[customer.id]?.riskFlag || 'low').toUpperCase()} ({signalsById[customer.id]?.riskScore || 0})
                    </span>
                  </div>
                </td>
                <td>
                  <Link to={`/customers/${customer.id}`} className="btn btn-small btn-outline">
                    View 360
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <PaginationControls
          page={tableState.page}
          pageSize={tableState.pageSize}
          totalPages={meta.totalPages}
          total={meta.total}
          loading={loading}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </section>
    </div>
  );
}
