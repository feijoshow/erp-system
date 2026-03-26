import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';

export default function PendingRefunds() {
  const { getAccessToken } = useAuth();
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function loadPendingRefunds() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const payload = await api.getPendingInvoiceRefunds(token);
      setRefunds(payload.data || []);
    } catch (error) {
      setMessage(error.message || 'Failed to load pending refunds');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPendingRefunds().catch(console.error);
  }, [getAccessToken]);

  async function handleApprove(refundId) {
    try {
      const token = await getAccessToken();
      await api.approveInvoiceRefund(token, refundId);
      setMessage('Refund approved.');
      await loadPendingRefunds();
    } catch (error) {
      setMessage(error.message || 'Failed to approve refund');
    }
  }

  async function handleReject(refundId) {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      const token = await getAccessToken();
      await api.rejectInvoiceRefund(token, refundId, { reason });
      setMessage('Refund rejected.');
      await loadPendingRefunds();
    } catch (error) {
      setMessage(error.message || 'Failed to reject refund');
    }
  }

  return (
    <div className="stack">
      <h1>Pending Refunds</h1>
      <p className="muted">Admin queue for refund requests waiting for approval.</p>
      {message ? <p className="muted">{message}</p> : null}
      <section className="card">
        {loading ? <p className="muted">Loading pending refunds...</p> : null}
        {!loading && refunds.length === 0 ? <p className="muted">No pending refunds in queue.</p> : null}
        {!loading && refunds.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Refund ID</th>
                <th>Invoice</th>
                <th>Order</th>
                <th>Amount</th>
                <th>Requested</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((refund) => (
                <tr key={refund.id}>
                  <td>{refund.id.slice(0, 8)}</td>
                  <td>{refund.invoice_id.slice(0, 8)}</td>
                  <td>{refund.invoices?.order_id ? refund.invoices.order_id.slice(0, 8) : '-'}</td>
                  <td>${Number(refund.amount).toFixed(2)}</td>
                  <td>{new Date(refund.created_at).toLocaleString()}</td>
                  <td>{refund.note || '-'}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" className="btn btn-small" onClick={() => handleApprove(refund.id)}>
                        Approve
                      </button>
                      <button type="button" className="btn btn-small btn-outline" onClick={() => handleReject(refund.id)}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
}
