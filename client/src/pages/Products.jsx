import { useEffect, useState } from 'react';
import PaginationControls from '../components/ui/PaginationControls';
import { useToast } from '../components/ui/ToastProvider';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTableControls } from '../hooks/useTableControls';
import { useUrlTableState } from '../hooks/useUrlTableState';

const initialForm = { name: '', sku: '', price: '', stockQty: '' };

function validateCreateForm(form) {
  const errors = {};

  if (!form.name.trim()) errors.name = 'Name is required.';
  if (!form.sku.trim()) errors.sku = 'SKU is required.';
  if (!form.price || Number(form.price) < 0) errors.price = 'Price must be 0 or greater.';
  if (!form.stockQty || Number(form.stockQty) < 0) errors.stockQty = 'Stock must be 0 or greater.';

  return errors;
}

function validateAdjustForm(form) {
  const errors = {};

  if (!form.productId) errors.productId = 'Select a product.';
  if (!form.deltaQty || Number(form.deltaQty) === 0) errors.deltaQty = 'Delta cannot be zero.';
  if (!form.reason.trim()) errors.reason = 'Reason is required.';

  return errors;
}

export default function Products() {
  const { getAccessToken, hasRole } = useAuth();
  const toast = useToast();
  const canCreate = hasRole('inventory', 'admin');
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [createErrors, setCreateErrors] = useState({});
  const [adjustment, setAdjustment] = useState({ productId: '', deltaQty: '', reason: '' });
  const [adjustErrors, setAdjustErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  const tableState = useUrlTableState('p_', {
    filter: 'all',
    sortKey: 'name',
    sortDirection: 'asc',
    page: 1,
    pageSize: 20,
  });
  const debouncedSearch = useDebouncedValue(tableState.search, 350);

  const table = useTableControls(products, {
    searchable: ['name', 'sku'],
    sorters: {
      name: (row) => row.name,
      sku: (row) => row.sku,
      price: (row) => Number(row.price || 0),
      stock: (row) => Number(row.stock_qty || 0),
    },
    initialSort: { key: 'name', direction: 'asc' },
    filter: (row, value) => {
      if (value === 'all') return true;
      if (value === 'low') return Number(row.stock_qty || 0) <= 10;
      if (value === 'healthy') return Number(row.stock_qty || 0) > 10;
      return true;
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

  async function loadProducts() {
    setLoading(true);
    setError('');
    try {
      const token = await getAccessToken();
      const payload = await api.getProducts(token, {
        page: tableState.page,
        pageSize: tableState.pageSize,
        q: debouncedSearch,
        stockFilter: tableState.activeFilter,
        sortBy: tableState.sortKey || 'created_at',
        sortDir: tableState.sortDirection || 'desc',
      });
      setProducts(payload.data || []);
      setMeta(payload.meta || { page: tableState.page, pageSize: tableState.pageSize, total: 0, totalPages: 1 });
    } catch (nextError) {
      setError(nextError.message || 'Unable to load products.');
      toast.error(nextError.message || 'Unable to load products.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts().catch(console.error);
  }, [
    getAccessToken,
    tableState.page,
    tableState.pageSize,
    debouncedSearch,
    tableState.activeFilter,
    tableState.sortKey,
    tableState.sortDirection,
  ]);

  async function handleCreate(event) {
    event.preventDefault();

    const errors = validateCreateForm(form);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setError('');

    const optimisticId = `temp-${Date.now()}`;
    const optimisticProduct = {
      id: optimisticId,
      name: form.name.trim(),
      sku: form.sku.trim(),
      price: Number(form.price),
      stock_qty: Number(form.stockQty),
    };

    if (tableState.page === 1) {
      setProducts((current) => [optimisticProduct, ...current].slice(0, tableState.pageSize));
    }
    setMeta((current) => ({ ...current, total: current.total + 1 }));
    setForm(initialForm);

    try {
      const token = await getAccessToken();
      const payload = await api.createProduct(token, {
        name: optimisticProduct.name,
        sku: optimisticProduct.sku,
        price: optimisticProduct.price,
        stockQty: optimisticProduct.stock_qty,
      });

      setProducts((current) =>
        current.map((row) => (row.id === optimisticId ? (payload.data || row) : row))
      );
      if (tableState.page !== 1) {
        await loadProducts();
      }
      toast.success('Product added successfully.');
    } catch (nextError) {
      setProducts((current) => current.filter((row) => row.id !== optimisticId));
      setMeta((current) => ({ ...current, total: Math.max(current.total - 1, 0) }));
      setError(nextError.message || 'Unable to add product.');
      toast.error(nextError.message || 'Unable to add product.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjustStock(event) {
    event.preventDefault();

    const errors = validateAdjustForm(adjustment);
    setAdjustErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setError('');

    const delta = Number(adjustment.deltaQty);
    const targetId = adjustment.productId;
    const previous = products.find((product) => product.id === targetId);

    setProducts((current) =>
      current.map((product) =>
        product.id === targetId ? { ...product, stock_qty: Number(product.stock_qty || 0) + delta } : product
      )
    );

    try {
      const token = await getAccessToken();
      await api.adjustProductStock(token, adjustment.productId, {
        deltaQty: delta,
        reason: adjustment.reason,
      });

      setAdjustment({ productId: '', deltaQty: '', reason: '' });
      toast.success('Stock adjusted successfully.');
    } catch (nextError) {
      if (previous) {
        setProducts((current) =>
          current.map((product) => (product.id === targetId ? previous : product))
        );
      }
      setError(nextError.message || 'Unable to adjust stock.');
      toast.error(nextError.message || 'Unable to adjust stock.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1>Products</h1>
      {error ? <p className="status">{error}</p> : null}

      {canCreate ? (
        <form className="card grid grid-4" onSubmit={handleCreate}>
        <input
          placeholder="Name"
          value={form.name}
          onChange={(event) => {
            setForm((current) => ({ ...current, name: event.target.value }));
            setCreateErrors((current) => ({ ...current, name: '' }));
          }}
          required
        />
        {createErrors.name ? <p className="status">{createErrors.name}</p> : null}
        <input
          placeholder="SKU"
          value={form.sku}
          onChange={(event) => {
            setForm((current) => ({ ...current, sku: event.target.value }));
            setCreateErrors((current) => ({ ...current, sku: '' }));
          }}
          required
        />
        {createErrors.sku ? <p className="status">{createErrors.sku}</p> : null}
        <input
          placeholder="Price"
          type="number"
          min="0"
          step="0.01"
          value={form.price}
          onChange={(event) => {
            setForm((current) => ({ ...current, price: event.target.value }));
            setCreateErrors((current) => ({ ...current, price: '' }));
          }}
          required
        />
        {createErrors.price ? <p className="status">{createErrors.price}</p> : null}
        <input
          placeholder="Stock"
          type="number"
          min="0"
          value={form.stockQty}
          onChange={(event) => {
            setForm((current) => ({ ...current, stockQty: event.target.value }));
            setCreateErrors((current) => ({ ...current, stockQty: '' }));
          }}
          required
        />
        {createErrors.stockQty ? <p className="status">{createErrors.stockQty}</p> : null}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Add product'}
        </button>
        </form>
      ) : (
        <p className="muted">Only inventory and admin roles can add products.</p>
      )}

      {canCreate ? (
        <form className="card grid grid-3" onSubmit={handleAdjustStock}>
          <select
            value={adjustment.productId}
            onChange={(event) => {
              setAdjustment((current) => ({ ...current, productId: event.target.value }));
              setAdjustErrors((current) => ({ ...current, productId: '' }));
            }}
            required
          >
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.stock_qty} in stock)
              </option>
            ))}
          </select>
          {adjustErrors.productId ? <p className="status">{adjustErrors.productId}</p> : null}
          <input
            type="number"
            placeholder="Stock delta (e.g. -2 or 5)"
            value={adjustment.deltaQty}
            onChange={(event) => {
              setAdjustment((current) => ({ ...current, deltaQty: event.target.value }));
              setAdjustErrors((current) => ({ ...current, deltaQty: '' }));
            }}
            required
          />
          {adjustErrors.deltaQty ? <p className="status">{adjustErrors.deltaQty}</p> : null}
          <input
            placeholder="Reason"
            value={adjustment.reason}
            onChange={(event) => {
              setAdjustment((current) => ({ ...current, reason: event.target.value }));
              setAdjustErrors((current) => ({ ...current, reason: '' }));
            }}
            required
          />
          {adjustErrors.reason ? <p className="status">{adjustErrors.reason}</p> : null}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Applying...' : 'Apply stock adjustment'}
          </button>
        </form>
      ) : null}

      <section className="card">
        {loading ? <div className="table-fetch-bar" aria-hidden="true" /> : null}
        <div className="table-controls">
          <input
            type="search"
            value={table.search}
            placeholder="Search by name or SKU"
            onChange={(event) => table.setSearch(event.target.value)}
          />
          <select value={table.activeFilter} onChange={(event) => table.setActiveFilter(event.target.value)}>
            <option value="all">All stock levels</option>
            <option value="low">Low stock (&lt;=10)</option>
            <option value="healthy">Healthy stock (&gt;10)</option>
          </select>
        </div>
        {loading ? <p className="muted">Loading products...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('name')}>
                  Name <span className="sort-icon">{table.sortIndicator('name')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('sku')}>
                  SKU <span className="sort-icon">{table.sortIndicator('sku')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('price')}>
                  Price <span className="sort-icon">{table.sortIndicator('price')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('stock')}>
                  Stock <span className="sort-icon">{table.sortIndicator('stock')}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading && table.rows.length === 0 ? (
              <tr>
                <td colSpan="4" className="muted">
                  No products available.
                </td>
              </tr>
            ) : null}
            {table.rows.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{product.sku}</td>
                <td>${Number(product.price).toFixed(2)}</td>
                <td>{product.stock_qty}</td>
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
