import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';
import { downloadInvoiceReceipt } from '../lib/pdfReceipts';

export default function Invoices() {
  const { getAccessToken, hasRole } = useAuth();
  const canRecordPayment = hasRole('sales', 'admin');
  const canMarkPaid = hasRole('admin');
  const canRefund = hasRole('admin');
  const [invoices, setInvoices] = useState([]);
  const [busyInvoiceId, setBusyInvoiceId] = useState(null);
  const [message, setMessage] = useState('');
  const [paymentAmountByInvoice, setPaymentAmountByInvoice] = useState({});
  const [refundAmountByInvoice, setRefundAmountByInvoice] = useState({});

  async function loadInvoices() {
    const token = await getAccessToken();
    const payload = await api.getInvoices(token);
    setInvoices(payload.data);
  }

  useEffect(() => {
    loadInvoices().catch(console.error);
  }, [getAccessToken]);

  async function handleMarkPaid(invoiceId) {
    setBusyInvoiceId(invoiceId);
    setMessage('');

    try {
      const token = await getAccessToken();
      await api.payInvoice(token, invoiceId);
      await loadInvoices();
      setMessage('Invoice marked as paid.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyInvoiceId(null);
    }
  }

  async function handleAddPayment(invoiceId) {
    const rawAmount = paymentAmountByInvoice[invoiceId];
    const amount = Number(rawAmount);
    if (!amount || amount <= 0) {
      setMessage('Payment amount must be greater than zero.');
      return;
    }

    setBusyInvoiceId(invoiceId);
    setMessage('');

    try {
      const token = await getAccessToken();
      await api.createInvoicePayment(token, invoiceId, { amount });
      setPaymentAmountByInvoice((current) => ({ ...current, [invoiceId]: '' }));
      await loadInvoices();
      setMessage('Payment recorded successfully.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyInvoiceId(null);
    }
  }

  async function handleAddRefund(invoiceId) {
    const rawAmount = refundAmountByInvoice[invoiceId];
    const amount = Number(rawAmount);
    if (!amount || amount <= 0) {
      setMessage('Refund amount must be greater than zero.');
      return;
    }

    setBusyInvoiceId(invoiceId);
    setMessage('');

    try {
      const token = await getAccessToken();
      await api.createInvoiceRefund(token, invoiceId, { amount });
      setRefundAmountByInvoice((current) => ({ ...current, [invoiceId]: '' }));
      await loadInvoices();
      setMessage('Refund recorded successfully.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyInvoiceId(null);
    }
  }

  async function handleApproveRefund(refundId) {
    const token = await getAccessToken();
    await api.approveInvoiceRefund(token, refundId);
    setMessage('Refund approved.');
    await loadInvoices();
  }

  async function handleRejectRefund(refundId) {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;
    const token = await getAccessToken();
    await api.rejectInvoiceRefund(token, refundId, { reason });
    setMessage('Refund rejected.');
    await loadInvoices();
  }

  async function printInvoiceReceipt(invoice) {
    try {
      await downloadInvoiceReceipt(invoice);
    } catch {
      setMessage('Unable to generate receipt right now. Please try again.');
    }
  }

  return (
    <div className="stack">
      <h1>Invoices</h1>
      {message ? <p className="muted">{message}</p> : null}
      {canRefund ? (
        <p className="muted">
          Need a full approval list? <Link to="/admin/pending-refunds">Open pending refunds queue</Link>
        </p>
      ) : null}
      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice ID</th>
              <th>Order</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Refunded</th>
              <th>Net Paid</th>
              <th>Pending Refunds</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Issued</th>
              {canRecordPayment ? <th>Payments</th> : null}
              {canRefund ? <th>Refunds</th> : null}
              {canMarkPaid ? <th>Actions</th> : null}
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.id.slice(0, 8)}</td>
                <td>{invoice.order_id.slice(0, 8)}</td>
                <td>${Number(invoice.amount).toFixed(2)}</td>
                <td>${Number(invoice.paid_amount || 0).toFixed(2)}</td>
                <td>${Number(invoice.refunded_amount || 0).toFixed(2)}</td>
                <td>${Number(invoice.net_paid_amount || 0).toFixed(2)}</td>
                <td>${Number(invoice.pending_refund_amount || 0).toFixed(2)}</td>
                <td>${Number(invoice.balance_amount || 0).toFixed(2)}</td>
                <td>{invoice.status}</td>
                <td>{new Date(invoice.issued_at).toLocaleDateString()}</td>
                {canRecordPayment ? (
                  <td>
                    <div className="inline-actions">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Amount"
                        value={paymentAmountByInvoice[invoice.id] || ''}
                        onChange={(event) =>
                          setPaymentAmountByInvoice((current) => ({
                            ...current,
                            [invoice.id]: event.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={busyInvoiceId === invoice.id || invoice.balance_amount <= 0}
                        onClick={() => handleAddPayment(invoice.id)}
                      >
                        Add payment
                      </button>
                    </div>
                  </td>
                ) : null}
                {canRefund ? (
                  <td>
                    <div className="stack">
                      <div className="inline-actions">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Refund"
                          value={refundAmountByInvoice[invoice.id] || ''}
                          onChange={(event) =>
                            setRefundAmountByInvoice((current) => ({
                              ...current,
                              [invoice.id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-small"
                          disabled={busyInvoiceId === invoice.id || invoice.net_paid_amount <= 0}
                          onClick={() => handleAddRefund(invoice.id)}
                        >
                          Request refund
                        </button>
                      </div>
                      {(invoice.invoice_refunds || [])
                        .filter((refund) => refund.status === 'pending')
                        .map((refund) => (
                          <div className="inline-actions" key={refund.id}>
                            <span className="muted">Pending ${Number(refund.amount).toFixed(2)}</span>
                            <button type="button" className="btn btn-small" onClick={() => handleApproveRefund(refund.id)}>
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-small btn-outline"
                              onClick={() => handleRejectRefund(refund.id)}
                            >
                              Reject
                            </button>
                          </div>
                        ))}
                    </div>
                  </td>
                ) : null}
                {canMarkPaid ? (
                  <td>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={invoice.status === 'paid' || busyInvoiceId === invoice.id || invoice.balance_amount <= 0}
                      onClick={() => handleMarkPaid(invoice.id)}
                    >
                      {busyInvoiceId === invoice.id
                        ? 'Saving...'
                        : invoice.status === 'paid'
                          ? 'Paid'
                          : 'Mark paid'}
                    </button>
                  </td>
                ) : null}
                <td>
                  <button type="button" className="btn btn-small" onClick={() => printInvoiceReceipt(invoice)}>
                    Print
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
