import { useEffect, useState } from 'react';
import PaginationControls from '../components/ui/PaginationControls';
import { useToast } from '../components/ui/ToastProvider';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTableControls } from '../hooks/useTableControls';
import { useUrlTableState } from '../hooks/useUrlTableState';

export default function PendingRefunds() {
  const { getAccessToken } = useAuth();
  const toast = useToast();
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  const tableState = useUrlTableState('pr_', {
    sortKey: 'created',
    sortDirection: 'desc',
    page: 1,
    pageSize: 20,
  });
  const debouncedSearch = useDebouncedValue(tableState.search, 350);

  const table = useTableControls(refunds, {
    searchable: ['id', 'invoice_id', 'note'],
    sorters: {
      id: (row) => row.id,
      invoice: (row) => row.invoice_id,
      amount: (row) => Number(row.amount || 0),
      created: (row) => new Date(row.created_at).getTime(),
    },
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

  async function loadPendingRefunds() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const payload = await api.getPendingInvoiceRefunds(token, {
        page: tableState.page,
        pageSize: tableState.pageSize,
        q: debouncedSearch,
        sortBy: tableState.sortKey || 'created_at',
        sortDir: tableState.sortDirection || 'desc',
      });
      setRefunds(payload.data || []);
      setMeta(payload.meta || { page: tableState.page, pageSize: tableState.pageSize, total: 0, totalPages: 1 });
    } catch (error) {
      setMessage(error.message || 'Failed to load pending refunds');
      toast.error(error.message || 'Failed to load pending refunds');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPendingRefunds().catch(console.error);
  }, [getAccessToken, tableState.page, tableState.pageSize, debouncedSearch, tableState.sortKey, tableState.sortDirection]);

  async function handleApprove(refundId) {
    const previous = refunds;
    setRefunds((current) => current.filter((refund) => refund.id !== refundId));

    try {
      const token = await getAccessToken();
      await api.approveInvoiceRefund(token, refundId);
      setMessage('Refund approved.');
      toast.success('Refund approved.');
    } catch (error) {
      setRefunds(previous);
      setMessage(error.message || 'Failed to approve refund');
      toast.error(error.message || 'Failed to approve refund');
    }
  }

  async function handleReject(refundId) {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    const previous = refunds;
    setRefunds((current) => current.filter((refund) => refund.id !== refundId));

    try {
      const token = await getAccessToken();
      await api.rejectInvoiceRefund(token, refundId, { reason });
      setMessage('Refund rejected.');
      toast.info('Refund rejected.');
    } catch (error) {
      setRefunds(previous);
      setMessage(error.message || 'Failed to reject refund');
      toast.error(error.message || 'Failed to reject refund');
    }
  }

  return (
    <div className="stack">
      <h1>Pending Refunds</h1>
      <p className="muted">Admin queue for refund requests waiting for approval.</p>
      {message ? <p className="muted">{message}</p> : null}
      <section className="card">
        {loading ? <div className="table-fetch-bar" aria-hidden="true" /> : null}
        {loading ? <p className="muted">Loading pending refunds...</p> : null}
        {!loading && refunds.length === 0 ? <p className="muted">No pending refunds in queue.</p> : null}
        {!loading && refunds.length > 0 ? (
          <>
            <div className="table-controls">
              <input
                type="search"
                value={table.search}
                placeholder="Search pending refunds"
                onChange={(event) => table.setSearch(event.target.value)}
              />
            </div>
          <table className="table">
            <thead>
              <tr>
                <th>
                  <button className="sortable-button" type="button" onClick={() => table.toggleSort('id')}>
                    Refund ID <span className="sort-icon">{table.sortIndicator('id')}</span>
                  </button>
                </th>
                <th>
                  <button className="sortable-button" type="button" onClick={() => table.toggleSort('invoice')}>
                    Invoice <span className="sort-icon">{table.sortIndicator('invoice')}</span>
                  </button>
                </th>
                <th>Order</th>
                <th>
                  <button className="sortable-button" type="button" onClick={() => table.toggleSort('amount')}>
                    Amount <span className="sort-icon">{table.sortIndicator('amount')}</span>
                  </button>
                </th>
                <th>
                  <button className="sortable-button" type="button" onClick={() => table.toggleSort('created')}>
                    Requested <span className="sort-icon">{table.sortIndicator('created')}</span>
                  </button>
                </th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((refund) => (
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

          <PaginationControls
            page={tableState.page}
            pageSize={tableState.pageSize}
            totalPages={meta.totalPages}
            total={meta.total}
            loading={loading}
            onPageChange={tableState.setPage}
            onPageSizeChange={tableState.setPageSize}
          />
          </>
        ) : null}
      </section>
    </div>
  );
}
