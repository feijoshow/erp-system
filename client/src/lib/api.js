import { apiBaseUrl } from './apiBaseUrl';

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

async function request(path, token, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}${normalizedPath}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...options,
      signal: controller.signal,
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await response.json().catch(() => null) : null;

    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || `Request failed (${response.status})`);
    }

    if (response.status === 204) {
      return { data: null };
    }

    return payload ?? { data: null };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }

    if (error instanceof TypeError) {
      throw new Error('Network error. Check your connection and try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  getMe: (token) => request('/me', token),
  getDashboard: (token) => request('/dashboard', token),
  getActivityLogs: (token, params = {}) => request(`/dashboard/activity-logs${buildQuery(params)}`, token),
  getProducts: (token, params = {}) => request(`/products${buildQuery(params)}`, token),
  createProduct: (token, body) => request('/products', token, { method: 'POST', body: JSON.stringify(body) }),
  adjustProductStock: (token, productId, body) =>
    request(`/products/${productId}/adjust-stock`, token, { method: 'POST', body: JSON.stringify(body) }),
  getCustomers: (token, params = {}) => request(`/customers${buildQuery(params)}`, token),
  getCustomerProfile: (token, customerId) => request(`/customers/${customerId}/profile`, token),
  createCustomer: (token, body) => request('/customers', token, { method: 'POST', body: JSON.stringify(body) }),
  getOrders: (token, params = {}) => request(`/orders${buildQuery(params)}`, token),
  getOrderItems: (token, orderId) => request(`/orders/${orderId}/items`, token),
  updateOrderStatus: (token, orderId, body) =>
    request(`/orders/${orderId}/status`, token, { method: 'POST', body: JSON.stringify(body) }),
  getOrderReturns: (token, params = {}) => request(`/orders/returns/list${buildQuery(params)}`, token),
  approveOrderReturn: (token, returnId, body) =>
    request(`/orders/returns/${returnId}/approve`, token, {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  rejectOrderReturn: (token, returnId, body) =>
    request(`/orders/returns/${returnId}/reject`, token, { method: 'POST', body: JSON.stringify(body) }),
  createOrderReturn: (token, orderId, body) =>
    request(`/orders/${orderId}/returns`, token, { method: 'POST', body: JSON.stringify(body) }),
  createOrder: (token, body) => request('/orders', token, { method: 'POST', body: JSON.stringify(body) }),
  getInvoices: (token, params = {}) => request(`/invoices${buildQuery(params)}`, token),
  getInvoicePayments: (token, invoiceId) => request(`/invoices/${invoiceId}/payments`, token),
  getInvoiceRefunds: (token, invoiceId) => request(`/invoices/${invoiceId}/refunds`, token),
  getPendingInvoiceRefunds: (token, params = {}) =>
    request(`/invoices/refunds/pending${buildQuery(params)}`, token),
  createInvoicePayment: (token, invoiceId, body) =>
    request(`/invoices/${invoiceId}/payments`, token, { method: 'POST', body: JSON.stringify(body) }),
  createInvoiceRefund: (token, invoiceId, body) =>
    request(`/invoices/${invoiceId}/refunds`, token, { method: 'POST', body: JSON.stringify(body) }),
  approveInvoiceRefund: (token, refundId, body) =>
    request(`/invoices/refunds/${refundId}/approve`, token, {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  rejectInvoiceRefund: (token, refundId, body) =>
    request(`/invoices/refunds/${refundId}/reject`, token, { method: 'POST', body: JSON.stringify(body) }),
  payInvoice: (token, invoiceId) => request(`/invoices/${invoiceId}/pay`, token, { method: 'POST' }),
};
