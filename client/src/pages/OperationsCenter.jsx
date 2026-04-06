import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ui/ToastProvider';
import { useAuth } from '../features/auth/AuthContext';
import { api } from '../lib/api';

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function daysSince(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return Math.max(Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24)), 0);
}

function KpiCard({ label, value, tone = 'neutral', detail }) {
  return (
    <article className={`card stat-card ops-kpi-card ops-kpi-${tone}`}>
      <p className="muted">{label}</p>
      <h3>{value}</h3>
      <p className="card-subtitle">{detail}</p>
    </article>
  );
}

export default function OperationsCenter() {
  const { getAccessToken, hasRole } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState({
    dashboard: null,
    orders: [],
    invoices: [],
    returns: [],
    pendingRefunds: [],
  });

  const canViewPendingRefunds = hasRole('admin');

  async function loadSnapshot() {
    setLoading(true);
    setError('');

    try {
      const token = await getAccessToken();
      const [dashboardPayload, ordersPayload, invoicesPayload, returnsPayload, pendingRefundsPayload] =
        await Promise.all([
          api.getDashboard(token),
          api.getOrders(token, { page: 1, pageSize: 50, sortBy: 'created_at', sortDir: 'desc' }),
          api.getInvoices(token, { page: 1, pageSize: 50, sortBy: 'issued_at', sortDir: 'desc' }),
          api.getOrderReturns(token, { page: 1, pageSize: 50, status: 'all', sortBy: 'created_at', sortDir: 'desc' }),
          canViewPendingRefunds
            ? api.getPendingInvoiceRefunds(token, { page: 1, pageSize: 20, sortBy: 'created_at', sortDir: 'desc' })
            : Promise.resolve({ data: [] }),
        ]);

      setSnapshot({
        dashboard: dashboardPayload.data || null,
        orders: ordersPayload.data || [],
        invoices: invoicesPayload.data || [],
        returns: returnsPayload.data || [],
        pendingRefunds: pendingRefundsPayload.data || [],
      });
    } catch (nextError) {
      setError(nextError.message || 'Unable to load operations center data.');
      toast.error(nextError.message || 'Unable to load operations center data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSnapshot().catch(console.error);
  }, [getAccessToken, canViewPendingRefunds]);

  const metrics = useMemo(() => {
    const lowStockCount = snapshot.dashboard?.lowStockProducts?.length || 0;
    const pendingOrders = snapshot.orders.filter((order) => order.status === 'pending').length;
    const processingOrders = snapshot.orders.filter((order) => order.status === 'processing').length;
    const outstandingInvoices = snapshot.invoices.filter((invoice) => Number(invoice.balance_amount || 0) > 0);
    const atRiskInvoices = outstandingInvoices.filter((invoice) => daysSince(invoice.issued_at) >= 14);
    const pendingReturns = snapshot.returns.filter((item) => item.status === 'pending').length;
    const unresolvedRate = snapshot.returns.length
      ? Math.round((pendingReturns / snapshot.returns.length) * 100)
      : 0;

    const totalOutstandingAmount = outstandingInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.balance_amount || 0),
      0
    );

    return {
      lowStockCount,
      pendingOrders,
      processingOrders,
      atRiskInvoices: atRiskInvoices.length,
      pendingReturns,
      unresolvedRate,
      totalOutstandingAmount,
      pendingRefundCount: snapshot.pendingRefunds.length,
    };
  }, [snapshot]);

  const alerts = useMemo(() => {
    const nextAlerts = [];

    if (metrics.lowStockCount > 0) {
      nextAlerts.push({
        level: 'high',
        title: `${metrics.lowStockCount} SKUs are near stockout`,
        action: 'Replenish critical products to avoid fulfillment delays.',
      });
    }

    if (metrics.atRiskInvoices > 0) {
      nextAlerts.push({
        level: 'high',
        title: `${metrics.atRiskInvoices} invoices are 14+ days open`,
        action: `Outstanding exposure is ${formatMoney(metrics.totalOutstandingAmount)}. Trigger collections follow-up.`,
      });
    }

    if (metrics.pendingReturns > 0) {
      nextAlerts.push({
        level: 'medium',
        title: `${metrics.pendingReturns} return requests awaiting closure`,
        action: `Current unresolved return rate: ${metrics.unresolvedRate}%.`,
      });
    }

    if (canViewPendingRefunds && metrics.pendingRefundCount > 0) {
      nextAlerts.push({
        level: 'medium',
        title: `${metrics.pendingRefundCount} invoice refunds waiting for admin`,
        action: 'Review pending refunds queue to protect cashflow governance.',
      });
    }

    if (nextAlerts.length === 0) {
      nextAlerts.push({
        level: 'good',
        title: 'No critical operational blockers detected',
        action: 'Maintain current cadence and continue monitoring.',
      });
    }

    return nextAlerts;
  }, [canViewPendingRefunds, metrics]);

  const activity = useMemo(() => {
    const orderEvents = snapshot.orders.slice(0, 6).map((order) => ({
      id: `order-${order.id}`,
      type: 'Order',
      title: `${String(order.id).slice(0, 8)} · ${order.status}`,
      subtitle: `${order.customer_name || 'Unknown customer'} · ${formatMoney(order.total_amount)}`,
      timestamp: order.created_at,
    }));

    const invoiceEvents = snapshot.invoices.slice(0, 6).map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: 'Invoice',
      title: `${String(invoice.id).slice(0, 8)} · ${invoice.status}`,
      subtitle: `Balance ${formatMoney(invoice.balance_amount)} · Issued ${new Date(invoice.issued_at).toLocaleDateString()}`,
      timestamp: invoice.issued_at,
    }));

    const returnEvents = snapshot.returns.slice(0, 6).map((item) => ({
      id: `return-${item.id}`,
      type: 'Return',
      title: `${String(item.id).slice(0, 8)} · ${item.status}`,
      subtitle: item.reason || 'No reason provided',
      timestamp: item.created_at,
    }));

    return [...orderEvents, ...invoiceEvents, ...returnEvents]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 10);
  }, [snapshot]);

  const collectionsForecast = useMemo(() => {
    const outstandingInvoices = snapshot.invoices.filter((invoice) => Number(invoice.balance_amount || 0) > 0);

    const pipeline = outstandingInvoices.reduce(
      (accumulator, invoice) => {
        const balance = Number(invoice.balance_amount || 0);
        const ageDays = daysSince(invoice.issued_at);

        if (ageDays <= 7) {
          accumulator.likely += balance;
          accumulator.collectable7d += balance * 0.75;
          accumulator.collectable14d += balance * 0.9;
        } else if (ageDays <= 14) {
          accumulator.probable += balance;
          accumulator.collectable7d += balance * 0.45;
          accumulator.collectable14d += balance * 0.7;
        } else {
          accumulator.atRisk += balance;
          accumulator.collectable7d += balance * 0.15;
          accumulator.collectable14d += balance * 0.3;
        }

        return accumulator;
      },
      {
        likely: 0,
        probable: 0,
        atRisk: 0,
        collectable7d: 0,
        collectable14d: 0,
      }
    );

    return {
      ...pipeline,
      outstandingCount: outstandingInvoices.length,
    };
  }, [snapshot.invoices]);

  const actionQueue = useMemo(() => {
    const queue = [];
    const pendingReturns = snapshot.returns.filter((item) => item.status === 'pending');
    const oldestReturn = pendingReturns
      .map((item) => daysSince(item.created_at))
      .reduce((max, value) => Math.max(max, value), 0);

    const oldestRefund = snapshot.pendingRefunds
      .map((item) => daysSince(item.created_at))
      .reduce((max, value) => Math.max(max, value), 0);

    if (metrics.atRiskInvoices > 0) {
      queue.push({
        severity: 'high',
        title: `Escalate ${metrics.atRiskInvoices} aged invoices`,
        detail: `Prioritize ${formatMoney(collectionsForecast.atRisk)} at risk beyond 14 days.`,
        route: '/invoices',
        cta: 'Open receivables',
      });
    }

    if (pendingReturns.length > 0) {
      queue.push({
        severity: oldestReturn > 3 ? 'high' : 'medium',
        title: `Clear ${pendingReturns.length} pending return requests`,
        detail: `Oldest pending return is ${oldestReturn} day(s) old.`,
        route: '/approvals',
        cta: 'Review returns',
      });
    }

    if (canViewPendingRefunds && snapshot.pendingRefunds.length > 0) {
      queue.push({
        severity: oldestRefund > 2 ? 'high' : 'medium',
        title: `Process ${snapshot.pendingRefunds.length} refund decisions`,
        detail: `Oldest pending refund is ${oldestRefund} day(s) old.`,
        route: '/approvals',
        cta: 'Review refunds',
      });
    }

    if (metrics.lowStockCount > 0) {
      queue.push({
        severity: 'medium',
        title: `Replenish ${metrics.lowStockCount} low-stock SKUs`,
        detail: 'Prevent service-level misses by replenishing critical inventory.',
        route: '/products',
        cta: 'Open inventory',
      });
    }

    return queue.slice(0, 5);
  }, [canViewPendingRefunds, collectionsForecast.atRisk, metrics, snapshot.pendingRefunds, snapshot.returns]);

  return (
    <div className="stack">
      <div className="page-title-row">
        <div>
          <h1>Operations Center</h1>
          <p className="muted">Cross-functional command layer for stock, fulfillment, collections, and returns.</p>
        </div>
        <button type="button" className="btn" onClick={loadSnapshot} disabled={loading}>
          {loading ? 'Syncing...' : 'Sync now'}
        </button>
      </div>

      {error ? <p className="status">{error}</p> : null}

      <section className="grid grid-4">
        <KpiCard
          label="At-risk receivables"
          value={metrics.atRiskInvoices}
          tone={metrics.atRiskInvoices > 0 ? 'warn' : 'good'}
          detail={`${formatMoney(metrics.totalOutstandingAmount)} currently outstanding`}
        />
        <KpiCard
          label="Open fulfillment load"
          value={metrics.pendingOrders + metrics.processingOrders}
          tone={metrics.pendingOrders > 15 ? 'warn' : 'neutral'}
          detail={`${metrics.pendingOrders} pending · ${metrics.processingOrders} processing`}
        />
        <KpiCard
          label="Return pressure"
          value={`${metrics.unresolvedRate}%`}
          tone={metrics.unresolvedRate > 30 ? 'warn' : 'neutral'}
          detail={`${metrics.pendingReturns} pending return requests`}
        />
        <KpiCard
          label="Inventory risk"
          value={metrics.lowStockCount}
          tone={metrics.lowStockCount > 0 ? 'warn' : 'good'}
          detail="SKUs below low-stock threshold"
        />
        {canViewPendingRefunds ? (
          <KpiCard
            label="Refund queue"
            value={metrics.pendingRefundCount}
            tone={metrics.pendingRefundCount > 0 ? 'warn' : 'good'}
            detail="Pending admin approvals"
          />
        ) : null}
      </section>

      <section className="grid grid-3 ops-grid">
        <article className="card ops-panel">
          <div className="card-header card-header-tight">
            <div>
              <h2>Alert Board</h2>
              <p className="card-subtitle">Priority issues that need action now</p>
            </div>
          </div>
          <ul className="ops-alert-list">
            {alerts.map((alert, index) => (
              <li key={`${alert.title}-${index}`} className={`ops-alert ops-alert-${alert.level}`}>
                <strong>{alert.title}</strong>
                <p>{alert.action}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="card ops-panel">
          <div className="card-header card-header-tight">
            <div>
              <h2>Execution Lanes</h2>
              <p className="card-subtitle">Jump to workflows by function</p>
            </div>
          </div>
          <div className="ops-links">
            <Link to="/products" className="ops-link-card">
              <h3>Inventory Control</h3>
              <p>Rebalance stock, process adjustments, and clear low-stock risk.</p>
            </Link>
            <Link to="/orders" className="ops-link-card">
              <h3>Order Desk</h3>
              <p>Resolve pending orders and inspect return requests.</p>
            </Link>
            <Link to="/invoices" className="ops-link-card">
              <h3>Receivables</h3>
              <p>Monitor balances, post payments, and process invoice refunds.</p>
            </Link>
            {canViewPendingRefunds ? (
              <Link to="/approvals" className="ops-link-card">
                <h3>Approvals Workflow</h3>
                <p>Handle order transitions, return decisions, and refund approvals in one queue.</p>
              </Link>
            ) : null}
            {canViewPendingRefunds ? (
              <Link to="/admin/pending-refunds" className="ops-link-card">
                <h3>Refund Governance</h3>
                <p>Approve or reject queued refunds with full traceability.</p>
              </Link>
            ) : null}
          </div>
        </article>

        <article className="card ops-panel">
          <div className="card-header card-header-tight">
            <div>
              <h2>Live Activity</h2>
              <p className="card-subtitle">Recent cross-module events</p>
            </div>
          </div>
          <ul className="ops-activity-list">
            {activity.map((event) => (
              <li key={event.id}>
                <span className="ops-activity-type">{event.type}</span>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.subtitle}</p>
                </div>
                <time>{new Date(event.timestamp).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid grid-3 ops-grid">
        <article className="card ops-panel">
          <div className="card-header card-header-tight">
            <div>
              <h2>Collections Forecast</h2>
              <p className="card-subtitle">Expected receivable conversion over next 7-14 days</p>
            </div>
          </div>
          <ul className="detail-meta-list">
            <li>
              <span>Open invoices</span>
              <strong>{collectionsForecast.outstandingCount}</strong>
            </li>
            <li>
              <span>Likely collectible</span>
              <strong>{formatMoney(collectionsForecast.likely)}</strong>
            </li>
            <li>
              <span>Probable collectible</span>
              <strong>{formatMoney(collectionsForecast.probable)}</strong>
            </li>
            <li>
              <span>At-risk exposure</span>
              <strong>{formatMoney(collectionsForecast.atRisk)}</strong>
            </li>
            <li>
              <span>Projected 7-day inflow</span>
              <strong>{formatMoney(collectionsForecast.collectable7d)}</strong>
            </li>
            <li>
              <span>Projected 14-day inflow</span>
              <strong>{formatMoney(collectionsForecast.collectable14d)}</strong>
            </li>
          </ul>
        </article>

        <article className="card ops-panel">
          <div className="card-header card-header-tight">
            <div>
              <h2>Priority Action Queue</h2>
              <p className="card-subtitle">Operational tasks ranked by urgency and business impact</p>
            </div>
          </div>
          <ul className="action-queue-list">
            {actionQueue.length === 0 ? (
              <li className="ops-alert ops-alert-good">
                <strong>No urgent actions right now</strong>
                <p>Keep monitoring current queues and cashflow trend.</p>
              </li>
            ) : null}
            {actionQueue.map((item, index) => (
              <li key={`${item.title}-${index}`} className={`ops-alert ops-alert-${item.severity}`}>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <Link to={item.route} className="btn btn-small btn-outline">
                  {item.cta}
                </Link>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
