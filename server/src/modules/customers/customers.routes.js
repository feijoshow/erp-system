import { Router } from 'express';
import { z } from 'zod';
import { requireRoles } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../services/supabaseAdmin.js';
import { writeAuditLog } from '../../services/auditLogService.js';
import { fromSupabaseError } from '../../utils/appError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPageMeta, getPagination } from '../../utils/pagination.js';

const router = Router();

const createCustomerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(7).optional().or(z.literal('')),
});

router.get(
  '/',
  asyncHandler(async (request, response) => {
    const { page, pageSize, from, to } = getPagination(request.query);
    const search = String(request.query.q || '').trim();
    const sortBy = String(request.query.sortBy || 'created_at');
    const sortDir = String(request.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const sortable = {
      name: 'full_name',
      email: 'email',
      phone: 'phone',
      created_at: 'created_at',
    };

    const sortColumn = sortable[sortBy] || 'created_at';

    let query = supabaseAdmin.from('customers').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order(sortColumn, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(from, to);

    if (error) throw fromSupabaseError(error, { code: 'CUSTOMERS_FETCH_FAILED' });

    response.json({
      data,
      meta: getPageMeta({ page, pageSize, total: count || 0 }),
    });
  })
);

router.get(
  '/:customerId/profile',
  asyncHandler(async (request, response) => {
    const { customerId } = request.params;

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (customerError) throw fromSupabaseError(customerError, { code: 'CUSTOMER_PROFILE_FETCH_FAILED' });

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, customer_id, total_amount, status, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(25);

    if (ordersError) throw fromSupabaseError(ordersError, { code: 'CUSTOMER_ORDERS_FETCH_FAILED' });

    const orderIds = (orders || []).map((order) => order.id);
    let invoices = [];

    if (orderIds.length > 0) {
      const { data: invoiceRows, error: invoicesError } = await supabaseAdmin
        .from('invoices')
        .select('id, order_id, amount, status, issued_at, invoice_payments(amount, created_at), invoice_refunds(amount, status, created_at)')
        .in('order_id', orderIds)
        .order('issued_at', { ascending: false })
        .limit(30);

      if (invoicesError) throw fromSupabaseError(invoicesError, { code: 'CUSTOMER_INVOICES_FETCH_FAILED' });

      invoices = invoiceRows || [];
    }

    const enrichedInvoices = invoices.map((invoice) => {
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
      const firstPayment = (invoice.invoice_payments || [])
        .map((payment) => payment.created_at)
        .filter(Boolean)
        .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];

      const daysToFirstPayment = firstPayment
        ? Math.max(
            Math.round((new Date(firstPayment).getTime() - new Date(invoice.issued_at).getTime()) / (1000 * 60 * 60 * 24)),
            0
          )
        : null;

      return {
        ...invoice,
        paid_amount: Number(paidAmount.toFixed(2)),
        refunded_amount: Number(refundedAmount.toFixed(2)),
        net_paid_amount: Number(netPaidAmount.toFixed(2)),
        balance_amount: Number(balanceAmount.toFixed(2)),
        days_to_first_payment: daysToFirstPayment,
      };
    });

    const totalOrderValue = (orders || []).reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const totalInvoiced = enrichedInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const outstandingAmount = enrichedInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_amount || 0), 0);
    const paidInvoices = enrichedInvoices.filter((invoice) => Number(invoice.balance_amount || 0) === 0);
    const latePayments = paidInvoices.filter((invoice) => Number(invoice.days_to_first_payment || 0) > 14).length;
    const onTimePayments = paidInvoices.filter((invoice) => Number(invoice.days_to_first_payment || 0) <= 14).length;
    const overdueInvoices = enrichedInvoices.filter(
      (invoice) => invoice.status === 'overdue' || Number(invoice.balance_amount || 0) > 0
    ).length;
    const refundTouches = enrichedInvoices.reduce(
      (sum, invoice) => sum + (invoice.invoice_refunds?.length || 0),
      0
    );

    const riskScore = Math.min(
      100,
      Math.round(
        overdueInvoices * 18 +
          (outstandingAmount > 0 ? 20 : 0) +
          (latePayments > onTimePayments ? 15 : 0) +
          (refundTouches > 2 ? 12 : 0)
      )
    );

    const riskFlag = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';
    const isVip = totalOrderValue >= 15000 && riskFlag !== 'high';
    const isWatchlist = riskFlag === 'high' || outstandingAmount >= 5000;
    const segment = isWatchlist ? 'Watchlist' : isVip ? 'VIP' : 'Standard';

    response.json({
      data: {
        customer,
        summary: {
          order_count: orders?.length || 0,
          invoice_count: enrichedInvoices.length,
          total_order_value: Number(totalOrderValue.toFixed(2)),
          total_invoiced: Number(totalInvoiced.toFixed(2)),
          outstanding_amount: Number(outstandingAmount.toFixed(2)),
        },
        payment_behavior: {
          paid_invoice_count: paidInvoices.length,
          on_time_payments: onTimePayments,
          late_payments: latePayments,
          overdue_invoices: overdueInvoices,
        },
        risk: {
          score: riskScore,
          flag: riskFlag,
          refund_touches: refundTouches,
        },
        segment,
        orders: orders || [],
        invoices: enrichedInvoices,
      },
    });
  })
);

router.post(
  '/',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const body = createCustomerSchema.parse(request.body);

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({
        full_name: body.fullName,
        email: body.email || null,
        phone: body.phone || null,
      })
      .select('*')
      .single();

    if (error) throw fromSupabaseError(error, { code: 'CUSTOMER_CREATE_FAILED' });

    await writeAuditLog({
      userId: request.user.id,
      action: 'customer_created',
      entityType: 'customer',
      entityId: data.id,
    });

    response.status(201).json({ data });
  })
);

export default router;
