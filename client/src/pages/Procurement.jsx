import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useToast } from '../components/ui/ToastProvider';
import { useAuth } from '../features/auth/AuthContext';
import { api } from '../lib/api';

const initialSupplier = { name: '', contactEmail: '', phone: '', leadTimeDays: 7 };
const initialPurchaseOrder = {
  supplierId: '',
  expectedDate: '',
  notes: '',
  items: [{ productId: '', quantity: 1, unitCost: '' }],
};

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function shortId(value) {
  return String(value || '').slice(0, 8);
}

export default function Procurement() {
  const { getAccessToken, hasRole } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [analyticsMonths, setAnalyticsMonths] = useState(6);

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [procurementAnalytics, setProcurementAnalytics] = useState({
    supplierLeadVariance: [],
    poCycleTimeTrend: [],
    fillRateTrend: [],
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [receiveDrafts, setReceiveDrafts] = useState({});

  const [supplierForm, setSupplierForm] = useState(initialSupplier);
  const [purchaseOrderForm, setPurchaseOrderForm] = useState(initialPurchaseOrder);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const token = await getAccessToken();
      const [supplierPayload, productPayload, poPayload, analyticsPayload] = await Promise.all([
        api.getSuppliers(token),
        api.getProducts(token, { page: 1, pageSize: 100, stockFilter: 'all' }),
        api.getPurchaseOrders(token, { page: 1, pageSize: 50, status: 'all' }),
        api.getProcurementAnalytics(token, { months: analyticsMonths }),
      ]);

      setSuppliers(supplierPayload.data || []);
      setProducts(productPayload.data || []);
      setPurchaseOrders(poPayload.data || []);
      setProcurementAnalytics(analyticsPayload.data || { supplierLeadVariance: [], poCycleTimeTrend: [], fillRateTrend: [] });
    } catch (nextError) {
      setError(nextError.message || 'Unable to load procurement data.');
      toast.error(nextError.message || 'Unable to load procurement data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData().catch(console.error);
  }, [getAccessToken, analyticsMonths]);

  const isAdmin = hasRole('admin');

  function updatePoItem(index, key, value) {
    setPurchaseOrderForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }));
  }

  function addPoItemLine() {
    setPurchaseOrderForm((current) => ({
      ...current,
      items: [...current.items, { productId: '', quantity: 1, unitCost: '' }],
    }));
  }

  async function handleCreateSupplier(event) {
    event.preventDefault();

    if (!supplierForm.name.trim()) {
      toast.error('Supplier name is required.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      await api.createSupplier(token, {
        name: supplierForm.name.trim(),
        contactEmail: supplierForm.contactEmail.trim(),
        phone: supplierForm.phone.trim(),
        leadTimeDays: Number(supplierForm.leadTimeDays || 0),
      });
      setSupplierForm(initialSupplier);
      toast.success('Supplier created.');
      await loadData();
    } catch (nextError) {
      setError(nextError.message || 'Unable to create supplier.');
      toast.error(nextError.message || 'Unable to create supplier.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePurchaseOrder(event) {
    event.preventDefault();

    if (!purchaseOrderForm.supplierId) {
      toast.error('Select a supplier for this purchase order.');
      return;
    }

    const invalidItem = purchaseOrderForm.items.some(
      (item) => !item.productId || Number(item.quantity) <= 0 || Number(item.unitCost) <= 0
    );

    if (invalidItem) {
      toast.error('Each item needs product, quantity, and unit cost.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      await api.createPurchaseOrder(token, {
        supplierId: purchaseOrderForm.supplierId,
        expectedDate: purchaseOrderForm.expectedDate || null,
        notes: purchaseOrderForm.notes || null,
        items: purchaseOrderForm.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
        })),
      });
      setPurchaseOrderForm(initialPurchaseOrder);
      toast.success('Purchase order created.');
      await loadData();
    } catch (nextError) {
      setError(nextError.message || 'Unable to create purchase order.');
      toast.error(nextError.message || 'Unable to create purchase order.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprovePurchaseOrder(orderId) {
    setBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      await api.approvePurchaseOrder(token, orderId);
      toast.success('Purchase order approved.');
      await loadData();
    } catch (nextError) {
      setError(nextError.message || 'Unable to approve purchase order.');
      toast.error(nextError.message || 'Unable to approve purchase order.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReceivePurchaseOrder(orderId, body) {
    setBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      await api.receivePurchaseOrder(token, orderId, body);
      toast.success('Purchase order receipt processed and stock updated.');
      await loadData();
      if (selectedOrderId === orderId) {
        await handleViewItems(orderId);
      }
    } catch (nextError) {
      setError(nextError.message || 'Unable to receive purchase order.');
      toast.error(nextError.message || 'Unable to receive purchase order.');
    } finally {
      setBusy(false);
    }
  }

  async function handleViewItems(orderId) {
    setSelectedOrderId(orderId);
    setSelectedItems([]);

    try {
      const token = await getAccessToken();
      const payload = await api.getPurchaseOrderItems(token, orderId);
      const items = payload.data || [];
      setSelectedItems(items);
      setReceiveDrafts(
        Object.fromEntries(
          items.map((item) => [item.id, Math.max(Number(item.quantity || 0) - Number(item.received_qty || 0), 0)])
        )
      );
    } catch (nextError) {
      setError(nextError.message || 'Unable to load purchase order items.');
      toast.error(nextError.message || 'Unable to load purchase order items.');
    }
  }

  function updateReceiveDraft(itemId, value) {
    setReceiveDrafts((current) => ({ ...current, [itemId]: value }));
  }

  async function handleReceiveLine(item) {
    const remaining = Math.max(Number(item.quantity || 0) - Number(item.received_qty || 0), 0);
    const receiveQty = Number(receiveDrafts[item.id] || 0);

    if (receiveQty <= 0) {
      toast.error('Receive quantity must be greater than zero.');
      return;
    }

    if (receiveQty > remaining) {
      toast.error(`Cannot receive more than remaining quantity (${remaining}).`);
      return;
    }

    await handleReceivePurchaseOrder(selectedOrderId, {
      items: [{ itemId: item.id, quantityReceived: receiveQty }],
    });
  }

  async function handleReceiveAllRemaining() {
    const remainingItems = selectedItems
      .map((item) => ({
        itemId: item.id,
        remaining: Math.max(Number(item.quantity || 0) - Number(item.received_qty || 0), 0),
      }))
      .filter((item) => item.remaining > 0)
      .map((item) => ({ itemId: item.itemId, quantityReceived: item.remaining }));

    if (remainingItems.length === 0) {
      toast.info('All lines are already fully received.');
      return;
    }

    await handleReceivePurchaseOrder(selectedOrderId, { items: remainingItems });
  }

  const analyticsSummary = useMemo(() => {
    const leadVarianceRows = procurementAnalytics.supplierLeadVariance || [];
    const cycleRows = procurementAnalytics.poCycleTimeTrend || [];
    const fillRows = procurementAnalytics.fillRateTrend || [];

    const avgLeadVariance = leadVarianceRows.length
      ? leadVarianceRows.reduce((sum, row) => sum + Number(row.avgVarianceDays || 0), 0) / leadVarianceRows.length
      : 0;
    const avgCycleDays = cycleRows.length
      ? cycleRows.reduce((sum, row) => sum + Number(row.avgCycleDays || 0), 0) / cycleRows.length
      : 0;
    const avgFillRate = fillRows.length
      ? fillRows.reduce((sum, row) => sum + Number(row.fillRate || 0), 0) / fillRows.length
      : 0;

    return {
      avgLeadVariance: Number(avgLeadVariance.toFixed(1)),
      avgCycleDays: Number(avgCycleDays.toFixed(1)),
      avgFillRate: Number(avgFillRate.toFixed(1)),
    };
  }, [procurementAnalytics]);

  const draftTotal = purchaseOrderForm.items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
    0
  );

  return (
    <div className="stack">
      <div className="page-title-row">
        <div>
          <h1>Procurement</h1>
          <p className="muted">Manage suppliers, create purchase orders, and receive stock into inventory.</p>
        </div>
        <div className="inline-actions">
          <select value={analyticsMonths} onChange={(event) => setAnalyticsMonths(Number(event.target.value))}>
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
            <option value={24}>24 months</option>
          </select>
          <button type="button" className="btn btn-outline" onClick={loadData} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? <p className="status">{error}</p> : null}

      <section className="grid grid-3 procurement-grid">
        <article className="card">
          <div className="card-header card-header-tight">
            <div>
              <h2>Create Supplier</h2>
              <p className="card-subtitle">Register new supplier relationships</p>
            </div>
          </div>
          <form className="stack" onSubmit={handleCreateSupplier}>
            <input
              placeholder="Supplier name"
              value={supplierForm.name}
              onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
            <input
              placeholder="Contact email"
              type="email"
              value={supplierForm.contactEmail}
              onChange={(event) => setSupplierForm((current) => ({ ...current, contactEmail: event.target.value }))}
            />
            <input
              placeholder="Phone"
              value={supplierForm.phone}
              onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))}
            />
            <input
              placeholder="Lead time days"
              type="number"
              min="0"
              value={supplierForm.leadTimeDays}
              onChange={(event) => setSupplierForm((current) => ({ ...current, leadTimeDays: event.target.value }))}
            />
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Create supplier'}
            </button>
          </form>
        </article>

        <article className="card">
          <div className="card-header card-header-tight">
            <div>
              <h2>Create Purchase Order</h2>
              <p className="card-subtitle">Plan inbound stock from suppliers</p>
            </div>
          </div>
          <form className="stack" onSubmit={handleCreatePurchaseOrder}>
            <select
              value={purchaseOrderForm.supplierId}
              onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, supplierId: event.target.value }))}
              required
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={purchaseOrderForm.expectedDate}
              onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, expectedDate: event.target.value }))}
            />
            <input
              placeholder="Notes"
              value={purchaseOrderForm.notes}
              onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, notes: event.target.value }))}
            />
            {purchaseOrderForm.items.map((item, index) => (
              <div className="grid grid-3" key={index}>
                <select value={item.productId} onChange={(event) => updatePoItem(index, 'productId', event.target.value)}>
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(event) => updatePoItem(index, 'quantity', event.target.value)}
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Unit cost"
                  value={item.unitCost}
                  onChange={(event) => updatePoItem(index, 'unitCost', event.target.value)}
                />
              </div>
            ))}
            <div className="inline-actions">
              <button type="button" className="btn btn-small btn-outline" onClick={addPoItemLine}>
                Add item line
              </button>
              <strong>Draft total: {money(draftTotal)}</strong>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Create purchase order'}
            </button>
            <p className="muted">Orders above threshold require admin override approval.</p>
          </form>
        </article>

        <article className="card">
          <div className="card-header card-header-tight">
            <div>
              <h2>Suppliers</h2>
              <p className="card-subtitle">Active supplier directory</p>
            </div>
          </div>
          <ul className="detail-list">
            {suppliers.length === 0 ? <li className="muted">No suppliers yet.</li> : null}
            {suppliers.map((supplier) => (
              <li key={supplier.id}>
                <span>{supplier.name}</span>
                <strong>{supplier.lead_time_days}d lead</strong>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid grid-3 procurement-analytics-grid">
        <article className="card stat-card summary-card">
          <p className="muted">Avg lead variance</p>
          <h3>{analyticsSummary.avgLeadVariance} days</h3>
          <p className="card-subtitle">Average difference from supplier baseline lead times</p>
        </article>
        <article className="card stat-card summary-card">
          <p className="muted">PO cycle time</p>
          <h3>{analyticsSummary.avgCycleDays} days</h3>
          <p className="card-subtitle">Average days from PO creation to final receipt</p>
        </article>
        <article className="card stat-card summary-card">
          <p className="muted">Fill-rate</p>
          <h3>{analyticsSummary.avgFillRate}%</h3>
          <p className="card-subtitle">Average received quantity vs ordered quantity</p>
        </article>
      </section>

      <section className="grid grid-3 procurement-analytics-grid">
        <article className="card">
          <div className="card-header card-header-tight">
            <div>
              <h2>PO Cycle Time Trend</h2>
              <p className="card-subtitle">Monthly cycle time from PO creation to receiving</p>
            </div>
          </div>
          <div className="chart-wrap analytics-chart-wrap-sm">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={procurementAnalytics.poCycleTimeTrend || []}>
                <CartesianGrid strokeDasharray="4 4" stroke="#d1d5db" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avgCycleDays" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card">
          <div className="card-header card-header-tight">
            <div>
              <h2>Fill-Rate Trend</h2>
              <p className="card-subtitle">Monthly receipt completeness across all POs</p>
            </div>
          </div>
          <div className="chart-wrap analytics-chart-wrap-sm">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={procurementAnalytics.fillRateTrend || []}>
                <CartesianGrid strokeDasharray="4 4" stroke="#d1d5db" />
                <XAxis dataKey="month" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="fillRate" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card">
          <div className="card-header card-header-tight">
            <div>
              <h2>Supplier Lead Variance</h2>
              <p className="card-subtitle">Variance from supplier baseline lead time and on-time rates</p>
            </div>
          </div>
          <div className="chart-wrap analytics-chart-wrap-sm">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={(procurementAnalytics.supplierLeadVariance || []).slice(0, 8)}>
                <CartesianGrid strokeDasharray="4 4" stroke="#d1d5db" />
                <XAxis dataKey="supplierName" hide />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avgVarianceDays" fill="#ea580c" />
                <Bar dataKey="onTimeRate" fill="#0f766e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="detail-list">
            {(procurementAnalytics.supplierLeadVariance || []).slice(0, 5).map((supplier) => (
              <li key={supplier.supplierId}>
                <span>{supplier.supplierName}</span>
                <strong>{supplier.avgVarianceDays}d variance | {supplier.onTimeRate}% on time</strong>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="card table-card">
        <div className="card-header card-header-tight">
          <div>
            <h2>Purchase Orders</h2>
            <p className="card-subtitle">Track PO lifecycle from pending to received</p>
          </div>
        </div>
        {loading ? <p className="muted">Loading purchase orders...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>PO</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Total</th>
              <th>Expected</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && purchaseOrders.length === 0 ? (
              <tr>
                <td colSpan="6" className="muted">
                  No purchase orders yet.
                </td>
              </tr>
            ) : null}
            {purchaseOrders.map((purchaseOrder) => (
              <tr key={purchaseOrder.id}>
                <td>{shortId(purchaseOrder.id)}</td>
                <td>{purchaseOrder.supplier_name || '-'}</td>
                <td>{purchaseOrder.status}</td>
                <td>{money(purchaseOrder.total_amount)}</td>
                <td>{purchaseOrder.expected_date ? new Date(purchaseOrder.expected_date).toLocaleDateString() : '-'}</td>
                <td>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="btn btn-small btn-outline"
                      onClick={() => handleViewItems(purchaseOrder.id)}
                    >
                      Items
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy || !['pending', 'pending_approval'].includes(purchaseOrder.status) || (purchaseOrder.status === 'pending_approval' && !isAdmin)}
                      onClick={() => handleApprovePurchaseOrder(purchaseOrder.id)}
                    >
                      {purchaseOrder.status === 'pending_approval' ? 'Admin approve' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy || !['approved', 'partial_received', 'pending'].includes(purchaseOrder.status)}
                      onClick={() => handleReceivePurchaseOrder(purchaseOrder.id)}
                    >
                      Receive remaining
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {selectedOrderId ? (
          <section className="detail-panel">
            <div className="card-header card-header-tight">
              <div>
                <h3>PO Items for {shortId(selectedOrderId)}</h3>
              </div>
              <button type="button" className="btn btn-small btn-outline" onClick={handleReceiveAllRemaining}>
                Receive all remaining
              </button>
            </div>
            <ul className="detail-list">
              {selectedItems.length === 0 ? <li className="muted">No items loaded.</li> : null}
              {selectedItems.map((item) => (
                <li key={item.id}>
                  <div className="procurement-receive-row">
                    <span>
                      {item.products?.name || item.product_id} ({item.products?.sku || '-'})
                    </span>
                    <strong>
                      Qty {item.quantity} | Received {item.received_qty} | Remaining {Math.max(Number(item.quantity || 0) - Number(item.received_qty || 0), 0)} | {money(item.line_total)}
                    </strong>
                    <div className="inline-actions">
                      <input
                        type="number"
                        min="1"
                        max={Math.max(Number(item.quantity || 0) - Number(item.received_qty || 0), 0)}
                        value={receiveDrafts[item.id] ?? ''}
                        onChange={(event) => updateReceiveDraft(item.id, event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={busy || Math.max(Number(item.quantity || 0) - Number(item.received_qty || 0), 0) <= 0}
                        onClick={() => handleReceiveLine(item)}
                      >
                        Receive line
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </div>
  );
}
