import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../components/ui/ToastProvider';
import { useAuth } from '../features/auth/AuthContext';
import { api } from '../lib/api';

function shortId(value) {
  return String(value || '').slice(0, 8);
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function Approvals() {
  const { getAccessToken } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [notes, setNotes] = useState({});

  async function loadQueue() {
    setLoading(true);
    setError('');

    try {
      const token = await getAccessToken();
      const [ordersPayload, returnsPayload, refundsPayload, activityPayload] = await Promise.all([
        api.getOrders(token, { page: 1, pageSize: 50, sortBy: 'created_at', sortDir: 'desc' }),
        api.getOrderReturns(token, { page: 1, pageSize: 50, status: 'pending', sortBy: 'created_at', sortDir: 'desc' }),
        api.getPendingInvoiceRefunds(token, { page: 1, pageSize: 50, sortBy: 'created_at', sortDir: 'desc' }),
        api.getActivityLogs(token, { limit: 25, scope: 'approvals' }),
      ]);

      setOrders(ordersPayload.data || []);
      setReturns(returnsPayload.data || []);
      setRefunds(refundsPayload.data || []);
      setActivityLogs(activityPayload.data || []);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load approval queue.');
      toast.error(nextError.message || 'Unable to load approval queue.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQueue().catch(console.error);
  }, [getAccessToken]);

  const orderQueue = useMemo(
    () => orders.filter((order) => !['cancelled', 'completed'].includes(String(order.status || '').toLowerCase())),
    [orders]
  );

  function canCancelOrder(order) {
    return !['submitted', 'processing', 'completed', 'cancelled'].includes(String(order.status || '').toLowerCase());
  }

  function setNote(key, value) {
    setNotes((current) => ({ ...current, [key]: value }));
  }

  async function handleOrderStatus(order, status) {
    const noteKey = `order-${order.id}`;
    const note = (notes[noteKey] || '').trim();

    setBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      await api.updateOrderStatus(token, order.id, { status, note });
      toast.success(`Order ${shortId(order.id)} moved to ${status}.`);
      setNote(noteKey, '');
      await loadQueue();
    } catch (nextError) {
      setError(nextError.message || 'Unable to update order status.');
      toast.error(nextError.message || 'Unable to update order status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveReturn(request) {
    const noteKey = `return-${request.id}`;
    const note = (notes[noteKey] || '').trim();

    setBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      await api.approveOrderReturn(token, request.id, note ? { note } : undefined);
      toast.success(`Return ${shortId(request.id)} approved.`);
      setNote(noteKey, '');
      await loadQueue();
    } catch (nextError) {
      setError(nextError.message || 'Unable to approve return request.');
      toast.error(nextError.message || 'Unable to approve return request.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectReturn(request) {
    const noteKey = `return-${request.id}`;
    const reason = (notes[noteKey] || '').trim();

    if (!reason) {
      toast.error('Add an audit note before rejecting a return.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      await api.rejectOrderReturn(token, request.id, { reason });
      toast.info(`Return ${shortId(request.id)} rejected.`);
      setNote(noteKey, '');
      await loadQueue();
    } catch (nextError) {
      setError(nextError.message || 'Unable to reject return request.');
      toast.error(nextError.message || 'Unable to reject return request.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveRefund(refund) {
    const noteKey = `refund-${refund.id}`;
    const note = (notes[noteKey] || '').trim();

    setBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      await api.approveInvoiceRefund(token, refund.id, note ? { note } : undefined);
      toast.success(`Refund ${shortId(refund.id)} approved.`);
      setNote(noteKey, '');
      await loadQueue();
    } catch (nextError) {
      setError(nextError.message || 'Unable to approve refund request.');
      toast.error(nextError.message || 'Unable to approve refund request.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectRefund(refund) {
    const noteKey = `refund-${refund.id}`;
    const reason = (notes[noteKey] || '').trim();

    if (!reason) {
      toast.error('Add an audit note before rejecting a refund.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      await api.rejectInvoiceRefund(token, refund.id, { reason });
      toast.info(`Refund ${shortId(refund.id)} rejected.`);
      setNote(noteKey, '');
      await loadQueue();
    } catch (nextError) {
      setError(nextError.message || 'Unable to reject refund request.');
      toast.error(nextError.message || 'Unable to reject refund request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-title-row">
        <div>
          <h1>Approvals Workflow</h1>
          <p className="muted">Central queue for order decisions, return requests, and invoice refund governance.</p>
        </div>
        <button type="button" className="btn" onClick={loadQueue} disabled={loading || busy}>
          {loading ? 'Refreshing...' : 'Refresh queue'}
        </button>
      </div>

      {error ? <p className="status">{error}</p> : null}

      <section className="card table-card">
        <div className="card-header card-header-tight">
          <div>
            <h2>Order State Transitions</h2>
            <p className="card-subtitle">Move orders through approved statuses with optional audit notes.</p>
          </div>
        </div>
        {loading ? <p className="muted">Loading orders...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Total</th>
              <th>Audit note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && orderQueue.length === 0 ? (
              <tr>
                <td colSpan="6" className="muted">
                  No orders currently need status decisions.
                </td>
              </tr>
            ) : null}
            {orderQueue.map((order) => (
              <tr key={order.id}>
                <td>{shortId(order.id)}</td>
                <td>{order.customer_name || '-'}</td>
                <td>{order.status}</td>
                <td>{money(order.total_amount)}</td>
                <td>
                  <input
                    value={notes[`order-${order.id}`] || ''}
                    placeholder="Optional note"
                    onChange={(event) => setNote(`order-${order.id}`, event.target.value)}
                  />
                </td>
                <td>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy || String(order.status).toLowerCase() === 'submitted'}
                      onClick={() => handleOrderStatus(order, 'submitted')}
                    >
                      Submit
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-outline"
                      disabled={busy || !canCancelOrder(order)}
                      onClick={() => handleOrderStatus(order, 'cancelled')}
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card table-card">
        <div className="card-header card-header-tight">
          <div>
            <h2>Pending Return Approvals</h2>
            <p className="card-subtitle">Approve immediately or reject with mandatory note.</p>
          </div>
        </div>
        {loading ? <p className="muted">Loading returns...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Return</th>
              <th>Order</th>
              <th>Reason</th>
              <th>Audit note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && returns.length === 0 ? (
              <tr>
                <td colSpan="5" className="muted">
                  No pending return requests.
                </td>
              </tr>
            ) : null}
            {returns.map((request) => (
              <tr key={request.id}>
                <td>{shortId(request.id)}</td>
                <td>{shortId(request.order_id)}</td>
                <td>{request.reason || '-'}</td>
                <td>
                  <input
                    value={notes[`return-${request.id}`] || ''}
                    placeholder="Reason for reject / optional approval note"
                    onChange={(event) => setNote(`return-${request.id}`, event.target.value)}
                  />
                </td>
                <td>
                  <div className="inline-actions">
                    <button type="button" className="btn btn-small" disabled={busy} onClick={() => handleApproveReturn(request)}>
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-outline"
                      disabled={busy}
                      onClick={() => handleRejectReturn(request)}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card table-card">
        <div className="card-header card-header-tight">
          <div>
            <h2>Pending Invoice Refund Approvals</h2>
            <p className="card-subtitle">Track refund request notes and make final approval calls.</p>
          </div>
        </div>
        {loading ? <p className="muted">Loading refund queue...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Refund</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Request note</th>
              <th>Audit note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && refunds.length === 0 ? (
              <tr>
                <td colSpan="6" className="muted">
                  No pending invoice refund requests.
                </td>
              </tr>
            ) : null}
            {refunds.map((refund) => (
              <tr key={refund.id}>
                <td>{shortId(refund.id)}</td>
                <td>{shortId(refund.invoice_id)}</td>
                <td>{money(refund.amount)}</td>
                <td>{refund.note || '-'}</td>
                <td>
                  <input
                    value={notes[`refund-${refund.id}`] || ''}
                    placeholder="Reason for reject / optional approval note"
                    onChange={(event) => setNote(`refund-${refund.id}`, event.target.value)}
                  />
                </td>
                <td>
                  <div className="inline-actions">
                    <button type="button" className="btn btn-small" disabled={busy} onClick={() => handleApproveRefund(refund)}>
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-outline"
                      disabled={busy}
                      onClick={() => handleRejectRefund(refund)}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="card-header card-header-tight">
          <div>
            <h2>Approvals Activity Timeline</h2>
            <p className="card-subtitle">Recent activity_logs entries from approval-related entities.</p>
          </div>
        </div>

        <ul className="ops-activity-list">
          {!loading && activityLogs.length === 0 ? <li className="muted">No approval activity entries yet.</li> : null}
          {activityLogs.map((log) => (
            <li key={log.id}>
              <span className="ops-activity-type">{log.entity_type}</span>
              <div>
                <strong>{log.action}</strong>
                <p>
                  Entity {String(log.entity_id || '-').slice(0, 8)} | Actor {log.actor_name || String(log.user_id || '-').slice(0, 8)}
                </p>
              </div>
              <time>{new Date(log.created_at).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
