import { useEffect, useState } from 'react';
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

const blankItem = { productId: '', quantity: 1 };

function validateCreateOrder(customerId, items) {
  const errors = {};
  if (!customerId) {
    errors.customerId = 'Select a customer.';
  }

  if (!items.length || items.some((item) => !item.productId || Number(item.quantity) <= 0)) {
    errors.items = 'Each order line needs a product and quantity greater than zero.';
  }

  return errors;
}

function validateReturnForm(returnForm) {
  const errors = {};
  if (!returnForm.orderId) errors.orderId = 'Select an order.';
  if (!returnForm.productId) errors.productId = 'Select a returned product.';
  if (Number(returnForm.quantity) <= 0) errors.quantity = 'Quantity must be greater than zero.';
  if (!returnForm.reason.trim()) errors.reason = 'Return reason is required.';
  return errors;
}

export default function Orders() {
  const { getAccessToken, hasRole } = useAuth();
  const toast = useToast();
  const canCreate = hasRole('sales', 'admin');
  const canApprove = hasRole('admin');
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orderOptions, setOrderOptions] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState([blankItem]);
  const [orderItems, setOrderItems] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false);
  const [selectedOrderError, setSelectedOrderError] = useState('');
  const [returns, setReturns] = useState([]);
  const [returnForm, setReturnForm] = useState({ orderId: '', productId: '', quantity: 1, reason: '' });
  const [createErrors, setCreateErrors] = useState({});
  const [returnErrors, setReturnErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orderMeta, setOrderMeta] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [returnMeta, setReturnMeta] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  const orderState = useUrlTableState('o_', {
    filter: 'all',
    sortKey: 'date',
    sortDirection: 'desc',
    page: 1,
    pageSize: 20,
  });

  const returnState = useUrlTableState('or_', {
    filter: 'all',
    sortKey: 'created',
    sortDirection: 'desc',
    page: 1,
    pageSize: 20,
  });
  const debouncedOrderSearch = useDebouncedValue(orderState.search, 350);
  const debouncedReturnSearch = useDebouncedValue(returnState.search, 350);

  const orderTable = useTableControls(orders, {
    searchable: ['id', 'customer_name', 'status'],
    sorters: {
      id: (row) => row.id,
      customer: (row) => row.customer_name,
      total: (row) => Number(row.total_amount || 0),
      status: (row) => row.status,
      date: (row) => new Date(row.created_at).getTime(),
    },
    filter: (row, value) => (value === 'all' ? true : row.status === value),
    state: {
      search: orderState.search,
      setSearch: orderState.setSearch,
      activeFilter: orderState.activeFilter,
      setActiveFilter: orderState.setActiveFilter,
      sortKey: orderState.sortKey,
      sortDirection: orderState.sortDirection,
      setSort: orderState.setSort,
    },
    remote: true,
  });

  const returnTable = useTableControls(returns, {
    searchable: ['id', 'order_id', 'status', 'reason', 'decision_note'],
    sorters: {
      id: (row) => row.id,
      order: (row) => row.order_id,
      status: (row) => row.status,
      created: (row) => new Date(row.created_at).getTime(),
    },
    filter: (row, value) => (value === 'all' ? true : row.status === value),
    state: {
      search: returnState.search,
      setSearch: returnState.setSearch,
      activeFilter: returnState.activeFilter,
      setActiveFilter: returnState.setActiveFilter,
      sortKey: returnState.sortKey,
      sortDirection: returnState.sortDirection,
      setSort: returnState.setSort,
    },
    remote: true,
  });

  const orderQuickFilters = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Processing', value: 'processing' },
    { label: 'Completed', value: 'completed' },
  ];

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const token = await getAccessToken();
      const shouldLoadReference = customers.length === 0 || products.length === 0 || orderOptions.length === 0;

      const [ordersPayload, customersPayload, productsPayload, returnsPayload, orderOptionsPayload] = await Promise.all([
        api.getOrders(token, {
          page: orderState.page,
          pageSize: orderState.pageSize,
          q: debouncedOrderSearch,
          status: orderState.activeFilter,
          sortBy: orderState.sortKey || 'created_at',
          sortDir: orderState.sortDirection || 'desc',
        }),
        shouldLoadReference ? api.getCustomers(token, { page: 1, pageSize: 100 }) : Promise.resolve(null),
        shouldLoadReference ? api.getProducts(token, { page: 1, pageSize: 100 }) : Promise.resolve(null),
        api.getOrderReturns(token, {
          page: returnState.page,
          pageSize: returnState.pageSize,
          q: debouncedReturnSearch,
          status: returnState.activeFilter,
          sortBy: returnState.sortKey || 'created_at',
          sortDir: returnState.sortDirection || 'desc',
        }),
        shouldLoadReference ? api.getOrders(token, { page: 1, pageSize: 100 }) : Promise.resolve(null),
      ]);

      setOrders(ordersPayload.data || []);
      setReturns(returnsPayload.data || []);

      if (customersPayload) {
        setCustomers(customersPayload.data || []);
      }

      if (productsPayload) {
        setProducts(productsPayload.data || []);
      }

      if (orderOptionsPayload) {
        setOrderOptions(orderOptionsPayload.data || []);
      }

      setOrderMeta(ordersPayload.meta || { page: orderState.page, pageSize: orderState.pageSize, total: 0, totalPages: 1 });
      setReturnMeta(
        returnsPayload.meta || { page: returnState.page, pageSize: returnState.pageSize, total: 0, totalPages: 1 }
      );
    } catch (nextError) {
      setError(nextError.message || 'Unable to load orders data.');
      toast.error(nextError.message || 'Unable to load orders data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData().catch(console.error);
  }, [
    getAccessToken,
    orderState.page,
    orderState.pageSize,
    debouncedOrderSearch,
    orderState.activeFilter,
    orderState.sortKey,
    orderState.sortDirection,
    returnState.page,
    returnState.pageSize,
    debouncedReturnSearch,
    returnState.activeFilter,
    returnState.sortKey,
    returnState.sortDirection,
  ]);

  function updateItem(index, key, value) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  }

  async function handleCreate(event) {
    event.preventDefault();
    const validationErrors = validateCreateOrder(customerId, items);
    setCreateErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setBusy(true);
    setError('');

    const optimisticId = `temp-order-${Date.now()}`;
    const selectedCustomer = customers.find((customer) => customer.id === customerId);
    const totalAmount = items.reduce((sum, item) => {
      const product = products.find((nextProduct) => nextProduct.id === item.productId);
      return sum + Number(product?.price || 0) * Number(item.quantity || 0);
    }, 0);

    const optimisticOrder = {
      id: optimisticId,
      customer_name: selectedCustomer?.full_name || 'Pending customer',
      total_amount: totalAmount,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    if (orderState.page === 1) {
      setOrders((current) => [optimisticOrder, ...current].slice(0, orderState.pageSize));
    }
    setOrderOptions((current) => [optimisticOrder, ...current].slice(0, 100));
    setOrderMeta((current) => ({ ...current, total: current.total + 1 }));

    try {
      const token = await getAccessToken();
      await api.createOrder(token, {
        customerId,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
        })),
      });

      setItems([blankItem]);
      setCustomerId('');
      toast.success('Order created successfully.');
      await loadData();
    } catch (nextError) {
      setOrders((current) => current.filter((row) => row.id !== optimisticId));
      setOrderOptions((current) => current.filter((row) => row.id !== optimisticId));
      setOrderMeta((current) => ({ ...current, total: Math.max(current.total - 1, 0) }));
      setError(nextError.message || 'Unable to create order.');
      toast.error(nextError.message || 'Unable to create order.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOrderSelection(orderId) {
    setReturnForm((current) => ({ ...current, orderId, productId: '' }));
    if (!orderId) {
      setOrderItems([]);
      return;
    }

    try {
      const token = await getAccessToken();
      const payload = await api.getOrderItems(token, orderId);
      setOrderItems(payload.data || []);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load order items.');
      toast.error(nextError.message || 'Unable to load order items.');
    }
  }

  async function handleViewOrderDetails(order) {
    setSelectedOrder(order);
    setSelectedOrderError('');
    setSelectedOrderLoading(true);

    try {
      const token = await getAccessToken();
      const payload = await api.getOrderItems(token, order.id);
      setSelectedOrderItems(payload.data || []);
    } catch (nextError) {
      setSelectedOrderItems([]);
      setSelectedOrderError(nextError.message || 'Unable to load order details.');
      toast.error(nextError.message || 'Unable to load order details.');
    } finally {
      setSelectedOrderLoading(false);
    }
  }

  async function handleUseOrderForReturn() {
    if (!selectedOrder) {
      return;
    }

    setReturnForm((current) => ({ ...current, orderId: selectedOrder.id, productId: '' }));
    setOrderItems(selectedOrderItems);
    document.getElementById('order-return-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleReturn(event) {
    event.preventDefault();
    const validationErrors = validateReturnForm(returnForm);
    setReturnErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setBusy(true);
    setError('');

    const optimisticId = `temp-return-${Date.now()}`;
    const optimisticReturn = {
      id: optimisticId,
      order_id: returnForm.orderId,
      status: 'pending',
      reason: returnForm.reason,
      created_at: new Date().toISOString(),
      decision_note: null,
    };

    if (returnState.page === 1) {
      setReturns((current) => [optimisticReturn, ...current].slice(0, returnState.pageSize));
    }
    setReturnMeta((current) => ({ ...current, total: current.total + 1 }));

    try {
      const token = await getAccessToken();
      await api.createOrderReturn(token, returnForm.orderId, {
        productId: returnForm.productId,
        quantity: Number(returnForm.quantity),
        reason: returnForm.reason,
      });

      setReturnForm({ orderId: '', productId: '', quantity: 1, reason: '' });
      setOrderItems([]);
      toast.success('Return request created and waiting for approval.');
      await loadData();
    } catch (nextError) {
      setReturns((current) => current.filter((row) => row.id !== optimisticId));
      setReturnMeta((current) => ({ ...current, total: Math.max(current.total - 1, 0) }));
      setError(nextError.message || 'Unable to create return request.');
      toast.error(nextError.message || 'Unable to create return request.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveReturn(returnId) {
    setBusy(true);
    setError('');

    const previous = returns;
    setReturns((current) =>
      current.map((item) =>
        item.id === returnId ? { ...item, status: 'approved', decision_note: 'Approved by admin' } : item
      )
    );

    try {
      const token = await getAccessToken();
      await api.approveOrderReturn(token, returnId);
      toast.success('Return approved and inventory updated.');
      await loadData();
    } catch (nextError) {
      setReturns(previous);
      setError(nextError.message || 'Unable to approve return request.');
      toast.error(nextError.message || 'Unable to approve return request.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectReturn(returnId) {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    setBusy(true);
    setError('');

    const previous = returns;
    setReturns((current) =>
      current.map((item) =>
        item.id === returnId ? { ...item, status: 'rejected', decision_note: reason } : item
      )
    );

    try {
      const token = await getAccessToken();
      await api.rejectOrderReturn(token, returnId, { reason });
      toast.info('Return request rejected.');
      await loadData();
    } catch (nextError) {
      setReturns(previous);
      setError(nextError.message || 'Unable to reject return request.');
      toast.error(nextError.message || 'Unable to reject return request.');
    } finally {
      setBusy(false);
    }
  }

  async function printReturnReceipt(returnRequest) {
    try {
      const pdfReceipts = await getPdfReceiptsModule();
      await pdfReceipts.downloadReturnReceipt(returnRequest);
    } catch {
      toast.error('Unable to generate return receipt right now.');
    }
  }

  return (
    <div className="stack">
      <h1>Orders</h1>
      {error ? <p className="status">{error}</p> : null}

      {canCreate ? (
        <form className="card stack" onSubmit={handleCreate}>
          <select
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setCreateErrors((current) => ({ ...current, customerId: '' }));
            }}
            required
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option value={customer.id} key={customer.id}>
                {customer.full_name}
              </option>
            ))}
          </select>
          {createErrors.customerId ? <p className="status">{createErrors.customerId}</p> : null}

          {items.map((item, index) => (
            <div className="grid grid-3" key={index}>
              <select
                value={item.productId}
                onChange={(event) => updateItem(index, 'productId', event.target.value)}
                required
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option value={product.id} key={product.id}>
                    {product.name} ({product.stock_qty} in stock)
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                required
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setItems((current) => [...current, blankItem])}
              >
                Add line
              </button>
            </div>
          ))}

          {createErrors.items ? <p className="status">{createErrors.items}</p> : null}

          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Creating...' : 'Create order'}
          </button>
        </form>
      ) : (
        <p className="muted">Only sales and admin roles can create orders.</p>
      )}

      {canCreate ? (
        <form className="card grid grid-3" onSubmit={handleReturn} id="order-return-form">
          <select
            value={returnForm.orderId}
            onChange={(event) => {
              handleOrderSelection(event.target.value);
              setReturnErrors((current) => ({ ...current, orderId: '' }));
            }}
            required
          >
            <option value="">Select order to return from</option>
            {orderOptions.map((order) => (
              <option key={order.id} value={order.id}>
                {String(order.id).slice(0, 8)} - {order.customer_name || 'Unknown'}
              </option>
            ))}
          </select>
          {returnErrors.orderId ? <p className="status">{returnErrors.orderId}</p> : null}

          <select
            value={returnForm.productId}
            onChange={(event) => {
              setReturnForm((current) => ({ ...current, productId: event.target.value }));
              setReturnErrors((current) => ({ ...current, productId: '' }));
            }}
            required
          >
            <option value="">Select returned product</option>
            {orderItems.map((item) => (
              <option key={item.id} value={item.product_id}>
                {item.products?.name || item.product_id} (ordered qty: {item.quantity})
              </option>
            ))}
          </select>
          {returnErrors.productId ? <p className="status">{returnErrors.productId}</p> : null}

          <input
            type="number"
            min="1"
            value={returnForm.quantity}
            onChange={(event) => {
              setReturnForm((current) => ({ ...current, quantity: event.target.value }));
              setReturnErrors((current) => ({ ...current, quantity: '' }));
            }}
            required
          />
          {returnErrors.quantity ? <p className="status">{returnErrors.quantity}</p> : null}

          <input
            placeholder="Return reason"
            value={returnForm.reason}
            onChange={(event) => {
              setReturnForm((current) => ({ ...current, reason: event.target.value }));
              setReturnErrors((current) => ({ ...current, reason: '' }));
            }}
            required
          />
          {returnErrors.reason ? <p className="status">{returnErrors.reason}</p> : null}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Processing...' : 'Process return'}
          </button>
        </form>
      ) : null}

      <section className="card table-card">
        {selectedOrder ? (
          <section className="detail-panel">
            <div className="detail-panel-header">
              <div>
                <p className="muted">Order drill-down</p>
                <h2>{String(selectedOrder.id).slice(0, 8)}</h2>
                <p className="card-subtitle">
                  {selectedOrder.customer_name || 'Unknown customer'} | {selectedOrder.status} | $
                  {Number(selectedOrder.total_amount || 0).toFixed(2)}
                </p>
              </div>
              <div className="inline-actions">
                <button type="button" className="btn btn-small btn-outline" onClick={() => setSelectedOrder(null)}>
                  Close
                </button>
                {canCreate ? (
                  <button type="button" className="btn btn-small" onClick={handleUseOrderForReturn}>
                    Use for return
                  </button>
                ) : null}
              </div>
            </div>

            {selectedOrderLoading ? <p className="muted">Loading order details...</p> : null}
            {selectedOrderError ? <p className="status">{selectedOrderError}</p> : null}

            {!selectedOrderLoading && !selectedOrderError ? (
              <div className="detail-panel-grid">
                <div>
                  <p className="muted">Items</p>
                  {selectedOrderItems.length === 0 ? (
                    <p className="muted">No items returned for this order.</p>
                  ) : (
                    <ul className="detail-list">
                      {selectedOrderItems.map((item) => (
                        <li key={item.id}>
                          <span>{item.products?.name || item.product_id}</span>
                          <strong>
                            {item.quantity} x ${Number(item.unit_price || 0).toFixed(2)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="muted">Quick facts</p>
                  <ul className="detail-meta-list">
                    <li>
                      <span>Order ID</span>
                      <strong>{selectedOrder.id}</strong>
                    </li>
                    <li>
                      <span>Customer</span>
                      <strong>{selectedOrder.customer_name || '-'}</strong>
                    </li>
                    <li>
                      <span>Status</span>
                      <strong>{selectedOrder.status}</strong>
                    </li>
                    <li>
                      <span>Total</span>
                      <strong>${Number(selectedOrder.total_amount || 0).toFixed(2)}</strong>
                    </li>
                  </ul>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {loading ? <div className="table-fetch-bar" aria-hidden="true" /> : null}
        <div className="table-controls">
          <input
            type="search"
            value={orderTable.search}
            placeholder="Search orders"
            onChange={(event) => orderTable.setSearch(event.target.value)}
          />
          <select value={orderTable.activeFilter} onChange={(event) => orderTable.setActiveFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="filter-pills" aria-label="Order status quick filters">
          {orderQuickFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={orderState.activeFilter === filter.value ? 'btn btn-small filter-pill filter-pill-active' : 'btn btn-small btn-outline filter-pill'}
              onClick={() => orderState.setActiveFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        {loading ? <p className="muted">Loading orders...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>
                <button className="sortable-button" type="button" onClick={() => orderTable.toggleSort('id')}>
                  Order ID <span className="sort-icon">{orderTable.sortIndicator('id')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => orderTable.toggleSort('customer')}>
                  Customer <span className="sort-icon">{orderTable.sortIndicator('customer')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => orderTable.toggleSort('total')}>
                  Total <span className="sort-icon">{orderTable.sortIndicator('total')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => orderTable.toggleSort('status')}>
                  Status <span className="sort-icon">{orderTable.sortIndicator('status')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => orderTable.toggleSort('date')}>
                  Date <span className="sort-icon">{orderTable.sortIndicator('date')}</span>
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && orderTable.rows.length === 0 ? (
              <tr>
                <td colSpan="6" className="muted">
                  No orders found.
                </td>
              </tr>
            ) : null}
            {orderTable.rows.map((order) => (
              <tr key={order.id}>
                <td>{String(order.id).slice(0, 8)}</td>
                <td>{order.customer_name || '-'}</td>
                <td>${Number(order.total_amount).toFixed(2)}</td>
                <td>{order.status}</td>
                <td>{new Date(order.created_at).toLocaleDateString()}</td>
                <td>
                  <button type="button" className="btn btn-small btn-outline" onClick={() => handleViewOrderDetails(order)}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <PaginationControls
          page={orderState.page}
          pageSize={orderState.pageSize}
          totalPages={orderMeta.totalPages}
          total={orderMeta.total}
          loading={loading}
          onPageChange={orderState.setPage}
          onPageSizeChange={orderState.setPageSize}
        />
      </section>

      <section className="card table-card">
        <h2>Return Requests</h2>
        {loading ? <div className="table-fetch-bar" aria-hidden="true" /> : null}
        <div className="table-controls">
          <input
            type="search"
            value={returnTable.search}
            placeholder="Search return requests"
            onChange={(event) => returnTable.setSearch(event.target.value)}
          />
          <select value={returnTable.activeFilter} onChange={(event) => returnTable.setActiveFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        {loading ? <p className="muted">Loading return requests...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>
                <button className="sortable-button" type="button" onClick={() => returnTable.toggleSort('id')}>
                  Return ID <span className="sort-icon">{returnTable.sortIndicator('id')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => returnTable.toggleSort('order')}>
                  Order <span className="sort-icon">{returnTable.sortIndicator('order')}</span>
                </button>
              </th>
              <th>
                <button className="sortable-button" type="button" onClick={() => returnTable.toggleSort('status')}>
                  Status <span className="sort-icon">{returnTable.sortIndicator('status')}</span>
                </button>
              </th>
              <th>Reason</th>
              <th>
                <button className="sortable-button" type="button" onClick={() => returnTable.toggleSort('created')}>
                  Created <span className="sort-icon">{returnTable.sortIndicator('created')}</span>
                </button>
              </th>
              <th>Decision</th>
              <th>Receipt</th>
              {canApprove ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {!loading && returnTable.rows.length === 0 ? (
              <tr>
                <td colSpan={canApprove ? '8' : '7'} className="muted">
                  No return requests yet.
                </td>
              </tr>
            ) : null}
            {returnTable.rows.map((returnRequest) => (
              <tr key={returnRequest.id}>
                <td>{String(returnRequest.id).slice(0, 8)}</td>
                <td>{String(returnRequest.order_id).slice(0, 8)}</td>
                <td>{returnRequest.status}</td>
                <td>{returnRequest.reason || '-'}</td>
                <td>{new Date(returnRequest.created_at).toLocaleDateString()}</td>
                <td>{returnRequest.decision_note || '-'}</td>
                <td>
                  <button type="button" className="btn btn-small" onClick={() => printReturnReceipt(returnRequest)}>
                    Print
                  </button>
                </td>
                {canApprove ? (
                  <td>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={busy || returnRequest.status !== 'pending'}
                        onClick={() => handleApproveReturn(returnRequest.id)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-outline"
                        disabled={busy || returnRequest.status !== 'pending'}
                        onClick={() => handleRejectReturn(returnRequest.id)}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>

        <PaginationControls
          page={returnState.page}
          pageSize={returnState.pageSize}
          totalPages={returnMeta.totalPages}
          total={returnMeta.total}
          loading={loading}
          onPageChange={returnState.setPage}
          onPageSizeChange={returnState.setPageSize}
        />
      </section>
    </div>
  );
}
