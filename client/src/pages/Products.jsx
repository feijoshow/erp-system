import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';

const initialForm = { name: '', sku: '', price: '', stockQty: '' };

export default function Products() {
  const { getAccessToken, hasRole } = useAuth();
  const canCreate = hasRole('inventory', 'admin');
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [adjustment, setAdjustment] = useState({ productId: '', deltaQty: '', reason: '' });
  const [message, setMessage] = useState('');

  async function loadProducts() {
    const token = await getAccessToken();
    const payload = await api.getProducts(token);
    setProducts(payload.data);
  }

  useEffect(() => {
    loadProducts().catch(console.error);
  }, []);

  async function handleCreate(event) {
    event.preventDefault();

    const token = await getAccessToken();
    await api.createProduct(token, {
      name: form.name,
      sku: form.sku,
      price: Number(form.price),
      stockQty: Number(form.stockQty),
    });

    setForm(initialForm);
    await loadProducts();
  }

  async function handleAdjustStock(event) {
    event.preventDefault();

    const token = await getAccessToken();
    await api.adjustProductStock(token, adjustment.productId, {
      deltaQty: Number(adjustment.deltaQty),
      reason: adjustment.reason,
    });

    setAdjustment({ productId: '', deltaQty: '', reason: '' });
    setMessage('Stock adjusted successfully.');
    await loadProducts();
  }

  return (
    <div className="stack">
      <h1>Products</h1>
      {message ? <p className="muted">{message}</p> : null}

      {canCreate ? (
        <form className="card grid grid-4" onSubmit={handleCreate}>
        <input
          placeholder="Name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          required
        />
        <input
          placeholder="SKU"
          value={form.sku}
          onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
          required
        />
        <input
          placeholder="Price"
          type="number"
          min="0"
          step="0.01"
          value={form.price}
          onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
          required
        />
        <input
          placeholder="Stock"
          type="number"
          min="0"
          value={form.stockQty}
          onChange={(event) => setForm((current) => ({ ...current, stockQty: event.target.value }))}
          required
        />
        <button className="btn" type="submit">
          Add product
        </button>
        </form>
      ) : (
        <p className="muted">Only inventory and admin roles can add products.</p>
      )}

      {canCreate ? (
        <form className="card grid grid-3" onSubmit={handleAdjustStock}>
          <select
            value={adjustment.productId}
            onChange={(event) => setAdjustment((current) => ({ ...current, productId: event.target.value }))}
            required
          >
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.stock_qty} in stock)
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Stock delta (e.g. -2 or 5)"
            value={adjustment.deltaQty}
            onChange={(event) => setAdjustment((current) => ({ ...current, deltaQty: event.target.value }))}
            required
          />
          <input
            placeholder="Reason"
            value={adjustment.reason}
            onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))}
            required
          />
          <button className="btn" type="submit">
            Apply stock adjustment
          </button>
        </form>
      ) : null}

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Price</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{product.sku}</td>
                <td>${Number(product.price).toFixed(2)}</td>
                <td>{product.stock_qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
