import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';

function StatCard({ label, value }) {
  return (
    <article className="card stat-card">
      <p className="muted">{label}</p>
      <h3>{value}</h3>
    </article>
  );
}

export default function Dashboard() {
  const { getAccessToken } = useAuth();
  const [data, setData] = useState({
    totalProducts: 0,
    totalCustomers: 0,
    totalOrders: 0,
    unpaidInvoices: 0,
    paidRevenue: 0,
    lowStockProducts: [],
  });

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      const token = await getAccessToken();
      const payload = await api.getDashboard(token);
      if (mounted) {
        setData(payload.data);
      }
    }

    loadDashboard().catch(console.error);

    return () => {
      mounted = false;
    };
  }, [getAccessToken]);

  return (
    <div className="stack">
      <h1>Dashboard</h1>

      <section className="grid grid-4">
        <StatCard label="Products" value={data.totalProducts} />
        <StatCard label="Customers" value={data.totalCustomers} />
        <StatCard label="Orders" value={data.totalOrders} />
        <StatCard label="Unpaid invoices" value={data.unpaidInvoices} />
        <StatCard label="Paid revenue" value={`$${Number(data.paidRevenue).toFixed(2)}`} />
      </section>

      <section className="card">
        <h2>Low stock items</h2>
        {data.lowStockProducts.length === 0 ? (
          <p className="muted">No low stock products right now.</p>
        ) : (
          <ul>
            {data.lowStockProducts.map((product) => (
              <li key={product.id}>
                {product.name} ({product.sku}) - {product.stock_qty} left
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
