import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function StatCard({ label, value }) {
  return (
    <article className="card stat-card">
      <p className="muted">{label}</p>
      <h3>{value}</h3>
    </article>
  );
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount || 0));
}

function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

export default function Dashboard() {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({
    totalProducts: 0,
    totalCustomers: 0,
    totalOrders: 0,
    unpaidInvoices: 0,
    paidRevenue: 0,
    lowStockProducts: [],
  });

  async function loadDashboard() {
    setLoading(true);
    setError('');

    try {
      const token = await getAccessToken();
      const payload = await api.getDashboard(token);
      setData(payload.data || {});
    } catch (nextError) {
      setError(nextError.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard().catch(console.error);
  }, [getAccessToken]);

  const healthData = [
    { name: 'Products', value: Number(data.totalProducts || 0) },
    { name: 'Customers', value: Number(data.totalCustomers || 0) },
    { name: 'Orders', value: Number(data.totalOrders || 0) },
    { name: 'Unpaid', value: Number(data.unpaidInvoices || 0) },
  ];

  return (
    <div className="stack">
      <div className="page-title-row">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Live operating snapshot for products, sales, and receivables.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={loadDashboard} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? <p className="status">{error}</p> : null}

      <section className="grid grid-4">
        <StatCard label="Products" value={formatCount(data.totalProducts)} />
        <StatCard label="Customers" value={formatCount(data.totalCustomers)} />
        <StatCard label="Orders" value={formatCount(data.totalOrders)} />
        <StatCard label="Unpaid invoices" value={formatCount(data.unpaidInvoices)} />
        <StatCard label="Paid revenue" value={formatCurrency(data.paidRevenue)} />
      </section>

      <section className="card">
        <h2>Operational Health</h2>
        {loading ? (
          <p className="muted">Loading trend data...</p>
        ) : (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={healthData}>
                <CartesianGrid strokeDasharray="4 4" stroke="#d1d5db" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#0f766e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Low stock items</h2>
        {loading ? (
          <p className="muted">Loading low stock list...</p>
        ) : data.lowStockProducts.length === 0 ? (
          <p className="muted">No low stock products right now.</p>
        ) : (
          <ul className="low-stock-list">
            {data.lowStockProducts.map((product) => (
              <li key={product.id}>
                <span>
                  {product.name} ({product.sku})
                </span>
                <strong className="status-badge">{product.stock_qty} left</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
