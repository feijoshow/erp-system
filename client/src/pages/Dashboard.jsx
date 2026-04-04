import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';

const DashboardHealthChart = lazy(() => import('../components/charts/DashboardHealthChart'));

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
  const { getAccessToken, role } = useAuth();
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

  const healthData = useMemo(
    () => [
      { name: 'Products', value: Number(data.totalProducts || 0) },
      { name: 'Customers', value: Number(data.totalCustomers || 0) },
      { name: 'Orders', value: Number(data.totalOrders || 0) },
      { name: 'Unpaid', value: Number(data.unpaidInvoices || 0) },
    ],
    [data.totalProducts, data.totalCustomers, data.totalOrders, data.unpaidInvoices]
  );

  const roleView = role || 'sales';

  const quickActionsByRole = {
    admin: [
      { to: '/approvals', title: 'Run approvals', description: 'Approve or reject returns, refunds, and order transitions.' },
      { to: '/operations', title: 'Open operations center', description: 'Track cross-functional risk and live operating load.' },
      { to: '/admin/pending-refunds', title: 'Clear refund queue', description: 'Resolve pending cash-out decisions quickly.' },
      { to: '/invoices', title: 'Audit receivables', description: 'Investigate balances and mark invoices paid.' },
    ],
    inventory: [
      { to: '/products', title: 'Control stock', description: 'Review low stock and apply inventory adjustments.' },
      { to: '/orders', title: 'Watch fulfillment', description: 'Monitor order throughput and exceptions.' },
      { to: '/operations', title: 'Open operations center', description: 'Track fulfillment pressure and return load.' },
      { to: '/customers', title: 'Check demand accounts', description: 'Inspect customer order activity linked to stock movement.' },
    ],
    sales: [
      { to: '/customers', title: 'Work customer pipeline', description: 'Review customer activity and payment profile.' },
      { to: '/orders', title: 'Push order flow', description: 'Move new demand through to completion.' },
      { to: '/invoices', title: 'Collect receivables', description: 'Follow unpaid balances and post payments.' },
      { to: '/operations', title: 'Open operations center', description: 'Keep eyes on risk signals and queue pressure.' },
    ],
  };

  const roleCommandCopy = {
    admin: {
      title: 'Admin Command View',
      detail: 'Govern approvals, cash movements, and cross-module exceptions.',
    },
    inventory: {
      title: 'Inventory Command View',
      detail: 'Prioritize replenishment risk, fulfillment pacing, and return impact.',
    },
    sales: {
      title: 'Sales Command View',
      detail: 'Focus on order velocity, collection rhythm, and account follow-up.',
    },
  };

  const quickActions = quickActionsByRole[roleView] || quickActionsByRole.sales;
  const roleCommand = roleCommandCopy[roleView] || roleCommandCopy.sales;

  return (
    <div className="stack">
      <div className="page-title-row">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Live operating snapshot for products, sales, receivables, and role priorities.</p>
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

      <section className="quick-actions-grid">
        {quickActions.map((action) => (
          <Link key={action.to} to={action.to} className="card quick-action-card">
            <h2>{action.title}</h2>
            <p className="muted">{action.description}</p>
          </Link>
        ))}
      </section>

      <section className="card">
        <div className="card-header card-header-tight">
          <div>
            <h2>{roleCommand.title}</h2>
            <p className="card-subtitle">{roleCommand.detail}</p>
          </div>
        </div>
        <ul className="detail-meta-list">
          <li>
            <span>Role context</span>
            <strong>{roleView}</strong>
          </li>
          <li>
            <span>Unpaid invoices</span>
            <strong>{formatCount(data.unpaidInvoices)}</strong>
          </li>
          <li>
            <span>Low stock products</span>
            <strong>{formatCount(data.lowStockProducts?.length || 0)}</strong>
          </li>
          <li>
            <span>Paid revenue</span>
            <strong>{formatCurrency(data.paidRevenue)}</strong>
          </li>
        </ul>
      </section>

      <section className="card">
        <div className="card-header card-header-tight">
          <div>
            <h2>Operational Health</h2>
            <p className="card-subtitle">Relative volume across core entities</p>
          </div>
        </div>
        {loading ? (
          <p className="muted">Loading trend data...</p>
        ) : (
          <Suspense fallback={<p className="muted">Preparing chart...</p>}>
            <DashboardHealthChart data={healthData} />
          </Suspense>
        )}
      </section>

      <section className="card">
        <div className="card-header card-header-tight">
          <div>
            <h2>Low stock items</h2>
            <p className="card-subtitle">Products needing replenishment soon</p>
          </div>
        </div>
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
