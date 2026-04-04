import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PaginationControls from '../components/ui/PaginationControls';
import { useToast } from '../components/ui/ToastProvider';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTableControls } from '../hooks/useTableControls';
import { useUrlTableState } from '../hooks/useUrlTableState';

let pdfReceiptsModulePromise;

async function getPdfReceiptsModule() {
  if (!pdfReceiptsModulePromise) {
    pdfReceiptsModulePromise = import('../lib/pdfReceipts');
  }

  return pdfReceiptsModulePromise;
}

export default function Invoices() {
  const { getAccessToken, hasRole } = useAuth();
  const toast = useToast();
  const canRecordPayment = hasRole('sales', 'admin');
  const canMarkPaid = hasRole('admin');
  const canRefund = hasRole('admin');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyInvoiceId, setBusyInvoiceId] = useState(null);
  const [error, setError] = useState('');
  const [paymentAmountByInvoice, setPaymentAmountByInvoice] = useState({});
  const [refundAmountByInvoice, setRefundAmountByInvoice] = useState({});
  const [paymentErrors, setPaymentErrors] = useState({});
  const [refundErrors, setRefundErrors] = useState({});
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedInvoicePayments, setSelectedInvoicePayments] = useState([]);
  const [selectedInvoiceRefunds, setSelectedInvoiceRefunds] = useState([]);
  const [selectedInvoiceLoading, setSelectedInvoiceLoading] = useState(false);
  const [selectedInvoiceError, setSelectedInvoiceError] = useState('');

  const summary = useMemo(() => {
    const totals = invoices.reduce(
      (accumulator, invoice) => {
        const balanceAmount = Number(invoice.balance_amount || 0);
        const pendingRefundAmount = Number(invoice.pending_refund_amount || 0);

        accumulator.outstandingAmount += balanceAmount;
        accumulator.paidAmount += Number(invoice.paid_amount || 0);
        accumulator.pendingRefundAmount += pendingRefundAmount;

        if (balanceAmount > 0) {
          accumulator.outstandingCount += 1;
        }

        if (pendingRefundAmount > 0) {
          accumulator.pendingRefundCount += 1;
        }

        return accumulator;
      },
      {
        outstandingAmount: 0,
        outstandingCount: 0,
        paidAmount: 0,
        pendingRefundAmount: 0,
        pendingRefundCount: 0,
      }
    );

    return totals;
  }, [invoices]);

  const tableState = useUrlTableState('i_', {
    filter: 'all',
    sortKey: 'issued',
    sortDirection: 'desc',
    page: 1,
    pageSize: 20,
  });
  const debouncedSearch = useDebouncedValue(tableState.search, 350);

  const table = useTableControls(invoices, {
    searchable: ['id', 'order_id', 'status'],
    sorters: {
      id: (row) => row.id,
      order: (row) => row.order_id,
      amount: (row) => Number(row.amount || 0),
      balance: (row) => Number(row.balance_amount || 0),
      status: (row) => row.status,
      issued: (row) => new Date(row.issued_at).getTime(),
    },
    filter: (row, value) => (value === 'all' ? true : row.status === value),
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

  const columnCount =
    10 + (canRecordPayment ? 1 : 0) + (canRefund ? 1 : 0) + (canMarkPaid ? 1 : 0) + 1;

  function SummaryCard({ label, value, hint }) {
    return (
      <article className="card stat-card summary-card">
        <p className="muted">{label}</p>
        <h3>{value}</h3>
        <p className="card-subtitle">{hint}</p>
      </article>
    );
  }

  function patchInvoice(invoiceId, updater) {
    setInvoices((current) => current.map((invoice) => (invoice.id === invoiceId ? updater(invoice) : invoice)));
  }

  async function loadInvoices() {
    setLoading(true);
    setError('');

    try {
      const token = await getAccessToken();
      const payload = await api.getInvoices(token, {
        page: tableState.page,
        pageSize: tableState.pageSize,
        q: debouncedSearch,
        status: tableState.activeFilter,
        sortBy: tableState.sortKey || 'issued_at',
        sortDir: tableState.sortDirection || 'desc',
      });
      setInvoices(payload.data || []);
      setMeta(payload.meta || { page: tableState.page, pageSize: tableState.pageSize, total: 0, totalPages: 1 });
    } catch (nextError) {
      setError(nextError.message || 'Unable to load invoices.');
      toast.error(nextError.message || 'Unable to load invoices.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices().catch(console.error);
  }, [
    getAccessToken,
    tableState.page,
    tableState.pageSize,
    debouncedSearch,
    tableState.activeFilter,
    tableState.sortKey,
    tableState.sortDirection,
  ]);

  async function handleMarkPaid(invoiceId) {
    setBusyInvoiceId(invoiceId);
    setError('');

    const previous = invoices;
    patchInvoice(invoiceId, (invoice) => ({
      ...invoice,
      status: 'paid',
      paid_amount: Number(invoice.amount || invoice.paid_amount || 0),
      balance_amount: 0,
      net_paid_amount: Number(invoice.amount || invoice.net_paid_amount || 0),
    }));

    try {
      const token = await getAccessToken();
      await api.payInvoice(token, invoiceId);
      toast.success('Invoice marked as paid.');
    } catch (nextError) {
      setInvoices(previous);
      setError(nextError.message || 'Unable to mark invoice as paid.');
      toast.error(nextError.message || 'Unable to mark invoice as paid.');
    } finally {
      setBusyInvoiceId(null);
    }
  }

  async function handleAddPayment(invoiceId) {
    const rawAmount = paymentAmountByInvoice[invoiceId];
    const amount = Number(rawAmount);
    if (!amount || amount <= 0) {
      setPaymentErrors((current) => ({ ...current, [invoiceId]: 'Payment amount must be greater than zero.' }));
      return;
    }

    setBusyInvoiceId(invoiceId);
    setError('');
    setPaymentErrors((current) => ({ ...current, [invoiceId]: '' }));

    const previous = invoices;
    patchInvoice(invoiceId, (invoice) => {
      const paidAmount = Number(invoice.paid_amount || 0) + amount;
      const refundedAmount = Number(invoice.refunded_amount || 0);
      const netPaidAmount = paidAmount - refundedAmount;
      return {
        ...invoice,
        paid_amount: paidAmount,
        net_paid_amount: netPaidAmount,
        balance_amount: Math.max(Number(invoice.amount || 0) - netPaidAmount, 0),
      };
    });

    try {
      const token = await getAccessToken();
      await api.createInvoicePayment(token, invoiceId, { amount });
      setPaymentAmountByInvoice((current) => ({ ...current, [invoiceId]: '' }));
      toast.success('Payment recorded successfully.');
    } catch (nextError) {
      setInvoices(previous);
      setError(nextError.message || 'Unable to record payment.');
      toast.error(nextError.message || 'Unable to record payment.');
    } finally {
      setBusyInvoiceId(null);
    }
  }

  async function handleAddRefund(invoiceId) {
    const rawAmount = refundAmountByInvoice[invoiceId];
    const amount = Number(rawAmount);
    if (!amount || amount <= 0) {
      setRefundErrors((current) => ({ ...current, [invoiceId]: 'Refund amount must be greater than zero.' }));
      return;
    }

    setBusyInvoiceId(invoiceId);
    setError('');
    setRefundErrors((current) => ({ ...current, [invoiceId]: '' }));

    const optimisticRefundId = `temp-refund-${Date.now()}`;
    const previous = invoices;
    patchInvoice(invoiceId, (invoice) => ({
      ...invoice,
      pending_refund_amount: Number(invoice.pending_refund_amount || 0) + amount,
      invoice_refunds: [
        ...(invoice.invoice_refunds || []),
        { id: optimisticRefundId, amount, status: 'pending' },
      ],
    }));

    try {
      const token = await getAccessToken();
      await api.createInvoiceRefund(token, invoiceId, { amount });
      setRefundAmountByInvoice((current) => ({ ...current, [invoiceId]: '' }));
      toast.success('Refund request created.');
      await loadInvoices();
    } catch (nextError) {
      setInvoices(previous);
      setError(nextError.message || 'Unable to request refund.');
      toast.error(nextError.message || 'Unable to request refund.');
    } finally {
      setBusyInvoiceId(null);
    }
  }

  async function handleApproveRefund(invoiceId, refundId) {
    const previous = invoices;
    patchInvoice(invoiceId, (invoice) => ({
      ...invoice,
      pending_refund_amount: Math.max(Number(invoice.pending_refund_amount || 0) - Number((invoice.invoice_refunds || []).find((item) => item.id === refundId)?.amount || 0), 0),
      refunded_amount:
        Number(invoice.refunded_amount || 0) + Number((invoice.invoice_refunds || []).find((item) => item.id === refundId)?.amount || 0),
      invoice_refunds: (invoice.invoice_refunds || []).map((item) =>
        item.id === refundId ? { ...item, status: 'approved' } : item
      ),
    }));

    try {
      const token = await getAccessToken();
      await api.approveInvoiceRefund(token, refundId);
      toast.success('Refund approved.');
      await loadInvoices();
    } catch (nextError) {
      setInvoices(previous);
      setError(nextError.message || 'Unable to approve refund.');
      toast.error(nextError.message || 'Unable to approve refund.');
    }
  }

  async function handleRejectRefund(invoiceId, refundId) {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    const previous = invoices;
    patchInvoice(invoiceId, (invoice) => ({
      ...invoice,
      pending_refund_amount: Math.max(Number(invoice.pending_refund_amount || 0) - Number((invoice.invoice_refunds || []).find((item) => item.id === refundId)?.amount || 0), 0),
      invoice_refunds: (invoice.invoice_refunds || []).map((item) =>
        item.id === refundId ? { ...item, status: 'rejected', note: reason } : item
      ),
    }));

    try {
      const token = await getAccessToken();
      await api.rejectInvoiceRefund(token, refundId, { reason });
      toast.info('Refund rejected.');
      await loadInvoices();
    } catch (nextError) {
      setInvoices(previous);
      setError(nextError.message || 'Unable to reject refund.');
      toast.error(nextError.message || 'Unable to reject refund.');
    }
  }

  async function handleViewInvoiceDetails(invoice) {
    setSelectedInvoice(invoice);
    setSelectedInvoiceError('');
    setSelectedInvoiceLoading(true);

    try {
      const token = await getAccessToken();
      const [paymentsPayload, refundsPayload] = await Promise.all([
        api.getInvoicePayments(token, invoice.id),
        api.getInvoiceRefunds(token, invoice.id),
      ]);

      setSelectedInvoicePayments(paymentsPayload.data || []);
      setSelectedInvoiceRefunds(refundsPayload.data || []);
    } catch (nextError) {
      setSelectedInvoicePayments([]);
      setSelectedInvoiceRefunds([]);
      setSelectedInvoiceError(nextError.message || 'Unable to load invoice details.');
      toast.error(nextError.message || 'Unable to load invoice details.');
    } finally {
      setSelectedInvoiceLoading(false);
    }
  }

  async function printInvoiceReceipt(invoice) {
    try {
      const pdfReceipts = await getPdfReceiptsModule();
      await pdfReceipts.downloadInvoiceReceipt(invoice);
    } catch {
      toast.error('Unable to generate receipt right now.');
    }
  }

  return (
    <div className="stack">
      <h1>Invoices</h1>
      {error ? <p className="status">{error}</p> : null}
      {canRefund ? (
        <p className="muted">
          Need a full approval list? <Link to="/admin/pending-refunds">Open pending refunds queue</Link>
        </p>
      ) : null}

      {selectedInvoice ? (
        <section className="card detail-panel">
          <div className="detail-panel-header">
            <div>
              <p className="muted">Invoice drill-down</p>
              <h2>{selectedInvoice.id.slice(0, 8)}</h2>
              <p className="card-subtitle">
                Order {selectedInvoice.order_id.slice(0, 8)} | {selectedInvoice.status} | Balance $
                {Number(selectedInvoice.balance_amount || 0).toFixed(2)}
              </p>
            </div>
            <div className="inline-actions">
              <button type="button" className="btn btn-small btn-outline" onClick={() => setSelectedInvoice(null)}>
                Close
              </button>
            </div>
          </div>

          {selectedInvoiceLoading ? <p className="muted">Loading invoice details...</p> : null}
          {selectedInvoiceError ? <p className="status">{selectedInvoiceError}</p> : null}

          {!selectedInvoiceLoading && !selectedInvoiceError ? (
            <div className="detail-panel-grid">
              <div>
                <p className="muted">Payments</p>
                {selectedInvoicePayments.length === 0 ? (
                  <p className="muted">No payments recorded yet.</p>
                ) : (
                  <ul className="detail-list">
                    {selectedInvoicePayments.map((payment) => (
                      <li key={payment.id}>
                        <span>{new Date(payment.created_at || payment.paid_at || Date.now()).toLocaleString()}</span>
                        <strong>${Number(payment.amount || 0).toFixed(2)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="muted">Refunds</p>
                {selectedInvoiceRefunds.length === 0 ? (
                  <p className="muted">No refunds for this invoice yet.</p>
                ) : (
                  <ul className="detail-list">
                    {selectedInvoiceRefunds.map((refund) => (
                      <li key={refund.id}>
                        <span>{refund.status}</span>
                        <strong>${Number(refund.amount || 0).toFixed(2)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="muted">Invoice summary</p>
                <ul className="detail-meta-list">
                  <li>
                    <span>Invoice</span>
                    <strong>{selectedInvoice.id}</strong>
                  </li>
                  <li>
                    <span>Order</span>
                    <strong>{selectedInvoice.order_id}</strong>
                  </li>
                  <li>
                    <span>Paid</span>
                    <strong>${Number(selectedInvoice.paid_amount || 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Refunded</span>
                    <strong>${Number(selectedInvoice.refunded_amount || 0).toFixed(2)}</strong>
                  </li>
                </ul>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid grid-3">
        <SummaryCard
          label="Outstanding balance"
          value={`$${summary.outstandingAmount.toFixed(2)}`}
          hint={`${summary.outstandingCount} invoices still need payment`}
        />
        <SummaryCard
          label="Collected payments"
          value={`$${summary.paidAmount.toFixed(2)}`}
          hint="Gross amount recorded against invoices"
        />
        <SummaryCard
          label="Pending refunds"
          value={`$${summary.pendingRefundAmount.toFixed(2)}`}
          hint={`${summary.pendingRefundCount} invoices have active refund requests`}
        />
      </section>

      <section className="card table-card">
        {loading ? <div className="table-fetch-bar" aria-hidden="true" /> : null}
        <div className="table-controls">
          <input
            type="search"
            value={table.search}
            placeholder="Search invoices"
            onChange={(event) => table.setSearch(event.target.value)}
          />
          <select value={table.activeFilter} onChange={(event) => table.setActiveFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
          </select>
        </div>
        {loading ? <p className="muted">Loading invoices...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('id')}>
                  Invoice ID <span className="sort-icon">{table.sortIndicator('id')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('order')}>
                  Order <span className="sort-icon">{table.sortIndicator('order')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('amount')}>
                  Amount <span className="sort-icon">{table.sortIndicator('amount')}</span>
                </button>
              </th>
              <th>Paid</th>
              <th>Refunded</th>
              <th>Net Paid</th>
              <th>Pending Refunds</th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('balance')}>
                  Balance <span className="sort-icon">{table.sortIndicator('balance')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('status')}>
                  Status <span className="sort-icon">{table.sortIndicator('status')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => table.toggleSort('issued')}>
                  Issued <span className="sort-icon">{table.sortIndicator('issued')}</span>
                </button>
              </th>
              {canMarkPaid ? <th>Actions</th> : null}
              {canRecordPayment ? <th>Payments</th> : null}
              {canRefund ? <th>Refunds</th> : null}
              <th>Details</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {!loading && table.rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount + 1} className="muted">
                  No invoices found.
                </td>
              </tr>
            ) : null}
            {table.rows.map((invoice) => (
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
                    <div className="stack">
                      <div className="inline-actions">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Amount"
                          value={paymentAmountByInvoice[invoice.id] || ''}
                          onChange={(event) => {
                            setPaymentAmountByInvoice((current) => ({
                              ...current,
                              [invoice.id]: event.target.value,
                            }));
                            setPaymentErrors((current) => ({ ...current, [invoice.id]: '' }));
                          }}
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
                      {paymentErrors[invoice.id] ? <p className="status">{paymentErrors[invoice.id]}</p> : null}
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
                          onChange={(event) => {
                            setRefundAmountByInvoice((current) => ({
                              ...current,
                              [invoice.id]: event.target.value,
                            }));
                            setRefundErrors((current) => ({ ...current, [invoice.id]: '' }));
                          }}
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
                      {refundErrors[invoice.id] ? <p className="status">{refundErrors[invoice.id]}</p> : null}
                      {(invoice.invoice_refunds || [])
                        .filter((refund) => refund.status === 'pending')
                        .map((refund) => (
                          <div className="inline-actions" key={refund.id}>
                            <span className="muted">Pending ${Number(refund.amount).toFixed(2)}</span>
                            <button
                              type="button"
                              className="btn btn-small"
                              onClick={() => handleApproveRefund(invoice.id, refund.id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-small btn-outline"
                              onClick={() => handleRejectRefund(invoice.id, refund.id)}
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
                  <button type="button" className="btn btn-small btn-outline" onClick={() => handleViewInvoiceDetails(invoice)}>
                    Details
                  </button>
                </td>
                <td>
                  <button type="button" className="btn btn-small" onClick={() => printInvoiceReceipt(invoice)}>
                    Print
                  </button>
                </td>
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
