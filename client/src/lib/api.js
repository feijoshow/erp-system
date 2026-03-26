const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

async function request(path, token, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: { message: 'Unexpected API error' } }));
    throw new Error(payload?.error?.message || payload?.message || 'Request failed');
  }

  return response.json();
}

export const api = {
  getMe: (token) => request('/me', token),
  getDashboard: (token) => request('/dashboard', token),
  getProducts: (token) => request('/products', token),
  createProduct: (token, body) => request('/products', token, { method: 'POST', body: JSON.stringify(body) }),
  adjustProductStock: (token, productId, body) =>
    request(`/products/${productId}/adjust-stock`, token, { method: 'POST', body: JSON.stringify(body) }),
  getCustomers: (token) => request('/customers', token),
  createCustomer: (token, body) => request('/customers', token, { method: 'POST', body: JSON.stringify(body) }),
  getOrders: (token) => request('/orders', token),
  getOrderItems: (token, orderId) => request(`/orders/${orderId}/items`, token),
  getOrderReturns: (token) => request('/orders/returns/list', token),
  approveOrderReturn: (token, returnId) => request(`/orders/returns/${returnId}/approve`, token, { method: 'POST' }),
  rejectOrderReturn: (token, returnId, body) =>
    request(`/orders/returns/${returnId}/reject`, token, { method: 'POST', body: JSON.stringify(body) }),
  createOrderReturn: (token, orderId, body) =>
    request(`/orders/${orderId}/returns`, token, { method: 'POST', body: JSON.stringify(body) }),
  createOrder: (token, body) => request('/orders', token, { method: 'POST', body: JSON.stringify(body) }),
  getInvoices: (token) => request('/invoices', token),
  getInvoicePayments: (token, invoiceId) => request(`/invoices/${invoiceId}/payments`, token),
  getInvoiceRefunds: (token, invoiceId) => request(`/invoices/${invoiceId}/refunds`, token),
  getPendingInvoiceRefunds: (token) => request('/invoices/refunds/pending', token),
  createInvoicePayment: (token, invoiceId, body) =>
    request(`/invoices/${invoiceId}/payments`, token, { method: 'POST', body: JSON.stringify(body) }),
  createInvoiceRefund: (token, invoiceId, body) =>
    request(`/invoices/${invoiceId}/refunds`, token, { method: 'POST', body: JSON.stringify(body) }),
  approveInvoiceRefund: (token, refundId) => request(`/invoices/refunds/${refundId}/approve`, token, { method: 'POST' }),
  rejectInvoiceRefund: (token, refundId, body) =>
    request(`/invoices/refunds/${refundId}/reject`, token, { method: 'POST', body: JSON.stringify(body) }),
  payInvoice: (token, invoiceId) => request(`/invoices/${invoiceId}/pay`, token, { method: 'POST' }),
};
