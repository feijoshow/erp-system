import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';
import { downloadReturnReceipt } from '../lib/pdfReceipts';

const blankItem = { productId: '', quantity: 1 };

export default function Orders() {
  const { getAccessToken, hasRole } = useAuth();
  const canCreate = hasRole('sales', 'admin');
  const canApprove = hasRole('admin');
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState([blankItem]);
  const [orderItems, setOrderItems] = useState([]);
  const [returns, setReturns] = useState([]);
  const [returnForm, setReturnForm] = useState({ orderId: '', productId: '', quantity: 1, reason: '' });
  const [message, setMessage] = useState('');

  async function loadData() {
    const token = await getAccessToken();
    const [ordersPayload, customersPayload, productsPayload] = await Promise.all([
      api.getOrders(token),
      api.getCustomers(token),
      api.getProducts(token),
    ]);

    setOrders(ordersPayload.data);
    setCustomers(customersPayload.data);
    setProducts(productsPayload.data);

    const returnsPayload = await api.getOrderReturns(token);
    setReturns(returnsPayload.data || []);
  }

  useEffect(() => {
    loadData().catch(console.error);
  }, []);

  function updateItem(index, key, value) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  }

  async function handleCreate(event) {
    event.preventDefault();
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
    setMessage('Order created successfully.');
    await loadData();
  }

  async function handleOrderSelection(orderId) {
    setReturnForm((current) => ({ ...current, orderId, productId: '' }));
    if (!orderId) {
      setOrderItems([]);
      return;
    }

    const token = await getAccessToken();
    const payload = await api.getOrderItems(token, orderId);
    setOrderItems(payload.data || []);
  }

  async function handleReturn(event) {
    event.preventDefault();

    const token = await getAccessToken();
    await api.createOrderReturn(token, returnForm.orderId, {
      productId: returnForm.productId,
      quantity: Number(returnForm.quantity),
      reason: returnForm.reason,
    });

    setMessage('Return request created and waiting for approval.');
    setReturnForm({ orderId: '', productId: '', quantity: 1, reason: '' });
    setOrderItems([]);
    await loadData();
  }

  async function handleApproveReturn(returnId) {
    const token = await getAccessToken();
    await api.approveOrderReturn(token, returnId);
    setMessage('Return approved and stock/invoice updated.');
    await loadData();
  }

  async function handleRejectReturn(returnId) {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    const token = await getAccessToken();
    await api.rejectOrderReturn(token, returnId, { reason });
    setMessage('Return request rejected.');
    await loadData();
  }

  async function printReturnReceipt(returnRequest) {
    try {
      await downloadReturnReceipt(returnRequest);
    } catch {
      setMessage('Unable to generate return receipt right now. Please try again.');
    }
  }

  return (
    <div className="stack">
      <h1>Orders</h1>
      {message ? <p className="muted">{message}</p> : null}

      {canCreate ? (
        <form className="card stack" onSubmit={handleCreate}>
        <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
          <option value="">Select customer</option>
          {customers.map((customer) => (
            <option value={customer.id} key={customer.id}>
              {customer.full_name}
            </option>
          ))}
        </select>

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

        <button type="submit" className="btn">
          Create order
        </button>
        </form>
      ) : (
        <p className="muted">Only sales and admin roles can create orders.</p>
      )}

      {canCreate ? (
        <form className="card grid grid-3" onSubmit={handleReturn}>
          <select
            value={returnForm.orderId}
            onChange={(event) => handleOrderSelection(event.target.value)}
            required
          >
            <option value="">Select order to return from</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.id.slice(0, 8)} - {order.customer_name || 'Unknown'}
              </option>
            ))}
          </select>

          <select
            value={returnForm.productId}
            onChange={(event) => setReturnForm((current) => ({ ...current, productId: event.target.value }))}
            required
          >
            <option value="">Select returned product</option>
            {orderItems.map((item) => (
              <option key={item.id} value={item.product_id}>
                {item.products?.name || item.product_id} (ordered qty: {item.quantity})
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            value={returnForm.quantity}
            onChange={(event) => setReturnForm((current) => ({ ...current, quantity: event.target.value }))}
            required
          />

          <input
            placeholder="Return reason"
            value={returnForm.reason}
            onChange={(event) => setReturnForm((current) => ({ ...current, reason: event.target.value }))}
            required
          />

          <button className="btn" type="submit">
            Process return
          </button>
        </form>
      ) : null}

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id.slice(0, 8)}</td>
                <td>{order.customer_name || '-'}</td>
                <td>${Number(order.total_amount).toFixed(2)}</td>
                <td>{order.status}</td>
                <td>{new Date(order.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Return Requests</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Return ID</th>
              <th>Order</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Created</th>
              <th>Decision</th>
              <th>Receipt</th>
              {canApprove ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {returns.map((returnRequest) => (
              <tr key={returnRequest.id}>
                <td>{returnRequest.id.slice(0, 8)}</td>
                <td>{returnRequest.order_id.slice(0, 8)}</td>
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
                        disabled={returnRequest.status !== 'pending'}
                        onClick={() => handleApproveReturn(returnRequest.id)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-outline"
                        disabled={returnRequest.status !== 'pending'}
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
      </section>
    </div>
  );
}
