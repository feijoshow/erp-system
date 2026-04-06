import { Router } from 'express';
import { z } from 'zod';
import { requireRoles } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../services/supabaseAdmin.js';
import { fromSupabaseError } from '../../utils/appError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

const analyticsQuerySchema = z.object({
  months: z.coerce.number().int().min(3).max(24).optional(),
});

function monthKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key) {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function makeMonthRange(months) {
  const keys = [];
  const now = new Date();

  for (let index = months - 1; index >= 0; index -= 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  return keys;
}

function parseToNumber(value) {
  return Number(Number(value || 0).toFixed(2));
}

router.get(
  '/',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const { months = 6 } = analyticsQuerySchema.parse(request.query || {});
    const rangeKeys = makeMonthRange(months);
    const rangeSet = new Set(rangeKeys);

    const [ordersResult, invoicesResult] = await Promise.all([
      supabaseAdmin
        .from('orders')
        .select('id, customer_id, total_amount, status, created_at')
        .gte('created_at', `${rangeKeys[0]}-01T00:00:00.000Z`)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('invoices')
        .select('id, order_id, amount, status, issued_at, invoice_payments(amount, created_at), invoice_refunds(amount, status)')
        .gte('issued_at', `${rangeKeys[0]}-01T00:00:00.000Z`)
        .order('issued_at', { ascending: true }),
    ]);

    if (ordersResult.error) throw fromSupabaseError(ordersResult.error, { code: 'ANALYTICS_ORDERS_FETCH_FAILED' });
    if (invoicesResult.error) throw fromSupabaseError(invoicesResult.error, { code: 'ANALYTICS_INVOICES_FETCH_FAILED' });

    const orders = ordersResult.data || [];
    const invoices = invoicesResult.data || [];

    const ordersById = new Map(orders.map((order) => [order.id, order]));

    const customerStats = new Map();
    orders.forEach((order) => {
      const stats = customerStats.get(order.customer_id) || {
        totalOrderValue: 0,
        overdueInvoices: 0,
        outstandingAmount: 0,
        latePayments: 0,
        onTimePayments: 0,
      };

      stats.totalOrderValue += Number(order.total_amount || 0);
      customerStats.set(order.customer_id, stats);
    });

    invoices.forEach((invoice) => {
      const order = ordersById.get(invoice.order_id);
      if (!order?.customer_id) {
        return;
      }

      const stats = customerStats.get(order.customer_id) || {
        totalOrderValue: 0,
        overdueInvoices: 0,
        outstandingAmount: 0,
        latePayments: 0,
        onTimePayments: 0,
      };

      const paidAmount = (invoice.invoice_payments || []).reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );
      const refundedAmount = (invoice.invoice_refunds || []).reduce(
        (sum, refund) => (refund.status === 'approved' ? sum + Number(refund.amount || 0) : sum),
        0
      );
      const netPaidAmount = paidAmount - refundedAmount;
      const balanceAmount = Math.max(Number(invoice.amount || 0) - netPaidAmount, 0);

      if (invoice.status === 'overdue' || balanceAmount > 0) {
        stats.overdueInvoices += 1;
      }

      stats.outstandingAmount += balanceAmount;

      const firstPaymentAt = (invoice.invoice_payments || [])
        .map((payment) => payment.created_at)
        .filter(Boolean)
        .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];

      if (firstPaymentAt) {
        const daysToFirstPayment = Math.max(
          Math.round((new Date(firstPaymentAt).getTime() - new Date(invoice.issued_at).getTime()) / (1000 * 60 * 60 * 24)),
          0
        );

        if (daysToFirstPayment > 14) {
          stats.latePayments += 1;
        } else {
          stats.onTimePayments += 1;
        }
      }

      customerStats.set(order.customer_id, stats);
    });

    const customerSegment = new Map();
    customerStats.forEach((stats, customerId) => {
      const riskScore = Math.min(
        100,
        Math.round(
          stats.overdueInvoices * 18 +
            (stats.outstandingAmount > 0 ? 20 : 0) +
            (stats.latePayments > stats.onTimePayments ? 15 : 0)
        )
      );

      const riskFlag = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';
      const isVip = stats.totalOrderValue >= 15000 && riskFlag !== 'high';
      const isWatchlist = riskFlag === 'high' || stats.outstandingAmount >= 5000;

      customerSegment.set(customerId, isWatchlist ? 'Watchlist' : isVip ? 'VIP' : 'Standard');
    });

    const collectionMap = new Map(
      rangeKeys.map((key) => [
        key,
        { month: monthLabelFromKey(key), monthKey: key, invoiced: 0, collected: 0, efficiency: 0 },
      ])
    );

    const riskMap = new Map(
      rangeKeys.map((key) => [
        key,
        { month: monthLabelFromKey(key), monthKey: key, low: 0, medium: 0, high: 0 },
      ])
    );

    const segmentMap = new Map(
      rangeKeys.map((key) => [
        key,
        {
          month: monthLabelFromKey(key),
          monthKey: key,
          vipRevenue: 0,
          watchlistRevenue: 0,
          standardRevenue: 0,
          vipOrders: 0,
          watchlistOrders: 0,
          standardOrders: 0,
        },
      ])
    );

    invoices.forEach((invoice) => {
      const key = monthKey(invoice.issued_at);
      if (!key || !rangeSet.has(key)) {
        return;
      }

      const paidAmount = (invoice.invoice_payments || []).reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );
      const refundedAmount = (invoice.invoice_refunds || []).reduce(
        (sum, refund) => (refund.status === 'approved' ? sum + Number(refund.amount || 0) : sum),
        0
      );
      const netPaidAmount = paidAmount - refundedAmount;
      const balanceAmount = Math.max(Number(invoice.amount || 0) - netPaidAmount, 0);
      const ageDays = Math.max(Math.floor((Date.now() - new Date(invoice.issued_at).getTime()) / (1000 * 60 * 60 * 24)), 0);

      const collectionBucket = collectionMap.get(key);
      collectionBucket.invoiced += Number(invoice.amount || 0);
      collectionBucket.collected += netPaidAmount;

      const riskBucket = riskMap.get(key);
      if (invoice.status === 'overdue' || (balanceAmount > 0 && ageDays > 30)) {
        riskBucket.high += 1;
      } else if (balanceAmount > 0 && ageDays > 14) {
        riskBucket.medium += 1;
      } else {
        riskBucket.low += 1;
      }
    });

    orders.forEach((order) => {
      const key = monthKey(order.created_at);
      if (!key || !rangeSet.has(key)) {
        return;
      }

      const segment = customerSegment.get(order.customer_id) || 'Standard';
      const bucket = segmentMap.get(key);
      const amount = Number(order.total_amount || 0);

      if (segment === 'VIP') {
        bucket.vipRevenue += amount;
        bucket.vipOrders += 1;
      } else if (segment === 'Watchlist') {
        bucket.watchlistRevenue += amount;
        bucket.watchlistOrders += 1;
      } else {
        bucket.standardRevenue += amount;
        bucket.standardOrders += 1;
      }
    });

    const collectionEfficiencyTrend = [...collectionMap.values()].map((item) => {
      const efficiency = item.invoiced > 0 ? (item.collected / item.invoiced) * 100 : 0;
      return {
        ...item,
        invoiced: parseToNumber(item.invoiced),
        collected: parseToNumber(item.collected),
        efficiency: Number(efficiency.toFixed(1)),
      };
    });

    const riskMigrationTrend = [...riskMap.values()];

    const segmentPerformanceTrend = [...segmentMap.values()].map((item) => ({
      ...item,
      vipRevenue: parseToNumber(item.vipRevenue),
      watchlistRevenue: parseToNumber(item.watchlistRevenue),
      standardRevenue: parseToNumber(item.standardRevenue),
    }));

    response.json({
      data: {
        months,
        generatedAt: new Date().toISOString(),
        collectionEfficiencyTrend,
        riskMigrationTrend,
        segmentPerformanceTrend,
      },
    });
  })
);

export default router;
