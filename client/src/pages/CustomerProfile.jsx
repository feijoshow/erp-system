import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/ui/ToastProvider';
import { useAuth } from '../features/auth/AuthContext';
import { api } from '../lib/api';

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function riskClass(flag) {
  if (flag === 'high') return 'status-badge customer-risk-high';
  if (flag === 'medium') return 'status-badge customer-risk-medium';
  return 'status-badge customer-risk-low';
}

function segmentClass(segment) {
  if (segment === 'VIP') return 'status-badge customer-segment-vip';
  if (segment === 'Watchlist') return 'status-badge customer-segment-watchlist';
  return 'status-badge customer-segment-standard';
}

export default function CustomerProfile() {
  const { customerId } = useParams();
  const { getAccessToken } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError('');

      try {
        const token = await getAccessToken();
        const payload = await api.getCustomerProfile(token, customerId);
        setProfile(payload.data || null);
      } catch (nextError) {
        setError(nextError.message || 'Unable to load customer profile.');
        toast.error(nextError.message || 'Unable to load customer profile.');
      } finally {
        setLoading(false);
      }
    }

    loadProfile().catch(console.error);
  }, [customerId, getAccessToken]);

  const timeline = useMemo(() => {
    if (!profile) {
      return [];
    }

    const orderEvents = (profile.orders || []).map((order) => ({
      id: `order-${order.id}`,
      type: 'Order',
      title: `${String(order.id).slice(0, 8)} · ${order.status}`,
      value: money(order.total_amount),
      timestamp: order.created_at,
    }));

    const invoiceEvents = (profile.invoices || []).map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: 'Invoice',
      title: `${String(invoice.id).slice(0, 8)} · ${invoice.status}`,
      value: `${money(invoice.amount)} / balance ${money(invoice.balance_amount)}`,
      timestamp: invoice.issued_at,
    }));

    return [...orderEvents, ...invoiceEvents]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 12);
  }, [profile]);

  return (
    <div className="stack">
      <div className="page-title-row">
        <div>
          <h1>Customer 360</h1>
          <p className="muted">Unified profile with order history, receivable behavior, and risk signal.</p>
        </div>
        <Link to="/customers" className="btn btn-outline customer-back-link">
          Back to customers
        </Link>
      </div>

      {error ? <p className="status">{error}</p> : null}
      {loading ? <p className="muted">Loading customer profile...</p> : null}

      {!loading && profile ? (
        <>
          <section className="card customer-profile-hero">
            <div>
              <h2>{profile.customer?.full_name || 'Unknown customer'}</h2>
              <p className="card-subtitle">{profile.customer?.email || 'No email'} | {profile.customer?.phone || 'No phone'}</p>
            </div>
            <div className="customer-risk-wrap">
              <span className={segmentClass(profile.segment)}>
                Segment {String(profile.segment || 'Standard').toUpperCase()}
              </span>
              <span className={riskClass(profile.risk?.flag)}>
                Risk {String(profile.risk?.flag || 'low').toUpperCase()} ({Number(profile.risk?.score || 0)})
              </span>
              <p className="muted">Refund touches: {Number(profile.risk?.refund_touches || 0)}</p>
            </div>
          </section>

          <section className="grid grid-4">
            <article className="card stat-card">
              <p className="muted">Order count</p>
              <h3>{profile.summary?.order_count || 0}</h3>
            </article>
            <article className="card stat-card">
              <p className="muted">Invoice count</p>
              <h3>{profile.summary?.invoice_count || 0}</h3>
            </article>
            <article className="card stat-card">
              <p className="muted">Total ordered</p>
              <h3>{money(profile.summary?.total_order_value)}</h3>
            </article>
            <article className="card stat-card">
              <p className="muted">Outstanding</p>
              <h3>{money(profile.summary?.outstanding_amount)}</h3>
            </article>
          </section>

          <section className="grid grid-3 customer-360-grid">
            <article className="card table-card">
              <div className="card-header card-header-tight">
                <div>
                  <h2>Payment Behavior</h2>
                  <p className="card-subtitle">Collection rhythm and repayment quality</p>
                </div>
              </div>
              <ul className="detail-meta-list">
                <li>
                  <span>Paid invoices</span>
                  <strong>{profile.payment_behavior?.paid_invoice_count || 0}</strong>
                </li>
                <li>
                  <span>On-time payments</span>
                  <strong>{profile.payment_behavior?.on_time_payments || 0}</strong>
                </li>
                <li>
                  <span>Late payments</span>
                  <strong>{profile.payment_behavior?.late_payments || 0}</strong>
                </li>
                <li>
                  <span>Overdue invoices</span>
                  <strong>{profile.payment_behavior?.overdue_invoices || 0}</strong>
                </li>
              </ul>
            </article>

            <article className="card table-card customer-activity-panel">
              <div className="card-header card-header-tight">
                <div>
                  <h2>Recent Activity</h2>
                  <p className="card-subtitle">Latest customer order and invoice events</p>
                </div>
              </div>
              <ul className="ops-activity-list">
                {timeline.length === 0 ? <li className="muted">No recent activity yet.</li> : null}
                {timeline.map((event) => (
                  <li key={event.id}>
                    <span className="ops-activity-type">{event.type}</span>
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.value}</p>
                    </div>
                    <time>{new Date(event.timestamp).toLocaleDateString()}</time>
                  </li>
                ))}
              </ul>
            </article>

            <article className="card table-card">
              <div className="card-header card-header-tight">
                <div>
                  <h2>Risk Lens</h2>
                  <p className="card-subtitle">Signals used to classify payment risk</p>
                </div>
              </div>
              <ul className="detail-meta-list">
                <li>
                  <span>Outstanding exposure</span>
                  <strong>{money(profile.summary?.outstanding_amount)}</strong>
                </li>
                <li>
                  <span>Overdue invoice count</span>
                  <strong>{profile.payment_behavior?.overdue_invoices || 0}</strong>
                </li>
                <li>
                  <span>Late payment ratio</span>
                  <strong>
                    {Number(profile.payment_behavior?.late_payments || 0)} / {Math.max(Number(profile.payment_behavior?.paid_invoice_count || 0), 1)}
                  </strong>
                </li>
                <li>
                  <span>Risk score</span>
                  <strong>{Number(profile.risk?.score || 0)}</strong>
                </li>
              </ul>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
