import { Router } from 'express';
import { z } from 'zod';
import { requireRoles } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../services/supabaseAdmin.js';
import { writeAuditLog } from '../../services/auditLogService.js';
import { AppError } from '../../utils/appError.js';
import { fromSupabaseError } from '../../utils/appError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPageMeta, getPagination } from '../../utils/pagination.js';

const router = Router();

const createPaymentSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(300).optional(),
});

const rejectRefundSchema = z.object({
  reason: z.string().min(3).max(300),
});

router.get(
  '/',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const { page, pageSize, from, to } = getPagination(request.query);

    const { data, error, count } = await supabaseAdmin
      .from('invoices')
      .select('*, invoice_payments(amount), invoice_refunds(id, amount, status, note, created_at)', { count: 'exact' })
      .range(from, to)
      .order('issued_at', { ascending: false });

    if (error) throw fromSupabaseError(error, { code: 'INVOICES_FETCH_FAILED' });

    const enriched = (data || []).map((invoice) => {
      const paidAmount = (invoice.invoice_payments || []).reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );
      const refundedAmount = (invoice.invoice_refunds || []).reduce(
        (sum, refund) => (refund.status === 'approved' ? sum + Number(refund.amount || 0) : sum),
        0
      );
      const pendingRefundAmount = (invoice.invoice_refunds || []).reduce(
        (sum, refund) => (refund.status === 'pending' ? sum + Number(refund.amount || 0) : sum),
        0
      );
      const netPaidAmount = paidAmount - refundedAmount;

      return {
        ...invoice,
        paid_amount: Number(paidAmount.toFixed(2)),
        refunded_amount: Number(refundedAmount.toFixed(2)),
        pending_refund_amount: Number(pendingRefundAmount.toFixed(2)),
        net_paid_amount: Number(netPaidAmount.toFixed(2)),
        balance_amount: Number(Math.max(Number(invoice.amount) - netPaidAmount, 0).toFixed(2)),
      };
    });

    response.json({
      data: enriched,
      meta: getPageMeta({ page, pageSize, total: count || 0 }),
    });
  })
);

router.post(
  '/:invoiceId/payments',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const { invoiceId } = request.params;
    const body = createPaymentSchema.parse(request.body);

    const { data, error } = await supabaseAdmin.rpc('record_invoice_payment', {
      p_invoice_id: invoiceId,
      p_amount: body.amount,
      p_user_id: request.user.id,
      p_note: body.note || null,
    });

    if (error) {
      throw fromSupabaseError(error, {
        code: 'INVOICE_PAYMENT_FAILED',
        message: error.message || 'Could not record invoice payment',
      });
    }

    await writeAuditLog({
      userId: request.user.id,
      action: 'invoice_payment_recorded',
      entityType: 'invoice',
      entityId: invoiceId,
    });

    response.status(201).json({ data });
  })
);

router.get(
  '/refunds/pending',
  requireRoles('admin'),
  asyncHandler(async (_request, response) => {
    const { data, error } = await supabaseAdmin
      .from('invoice_refunds')
      .select('id, invoice_id, amount, note, status, created_at, invoices(id, order_id, amount, status, issued_at)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw fromSupabaseError(error, { code: 'PENDING_REFUNDS_FETCH_FAILED' });

    response.json({ data: data || [] });
  })
);

router.get(
  '/:invoiceId/payments',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const { invoiceId } = request.params;

    const { data, error } = await supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });

    if (error) throw fromSupabaseError(error, { code: 'INVOICE_PAYMENTS_FETCH_FAILED' });

    response.json({ data });
  })
);

router.post(
  '/:invoiceId/refunds',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const { invoiceId } = request.params;
    const body = createPaymentSchema.parse(request.body);

    const { data, error } = await supabaseAdmin.rpc('create_invoice_refund_request', {
      p_invoice_id: invoiceId,
      p_amount: body.amount,
      p_user_id: request.user.id,
      p_note: body.note || null,
    });

    if (error) {
      throw fromSupabaseError(error, {
        code: 'INVOICE_REFUND_REQUEST_FAILED',
        message: error.message || 'Could not create refund request',
      });
    }

    await writeAuditLog({
      userId: request.user.id,
      action: 'invoice_refund_requested',
      entityType: 'invoice',
      entityId: invoiceId,
    });

    response.status(201).json({ data });
  })
);

router.get(
  '/:invoiceId/refunds',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const { invoiceId } = request.params;

    const { data, error } = await supabaseAdmin
      .from('invoice_refunds')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });

    if (error) throw fromSupabaseError(error, { code: 'INVOICE_REFUNDS_FETCH_FAILED' });
    response.json({ data });
  })
);

router.post(
  '/refunds/:refundId/approve',
  requireRoles('admin'),
  asyncHandler(async (request, response) => {
    const { refundId } = request.params;

    const { data, error } = await supabaseAdmin.rpc('approve_invoice_refund', {
      p_refund_id: refundId,
      p_user_id: request.user.id,
    });

    if (error) {
      throw fromSupabaseError(error, {
        code: 'INVOICE_REFUND_APPROVE_FAILED',
        message: error.message || 'Could not approve refund request',
      });
    }

    await writeAuditLog({
      userId: request.user.id,
      action: 'invoice_refund_approved',
      entityType: 'invoice_refund',
      entityId: refundId,
    });

    response.json({ data });
  })
);

router.post(
  '/refunds/:refundId/reject',
  requireRoles('admin'),
  asyncHandler(async (request, response) => {
    const { refundId } = request.params;
    const body = rejectRefundSchema.parse(request.body);

    const { data, error } = await supabaseAdmin.rpc('reject_invoice_refund', {
      p_refund_id: refundId,
      p_user_id: request.user.id,
      p_reason: body.reason,
    });

    if (error) {
      throw fromSupabaseError(error, {
        code: 'INVOICE_REFUND_REJECT_FAILED',
        message: error.message || 'Could not reject refund request',
      });
    }

    await writeAuditLog({
      userId: request.user.id,
      action: 'invoice_refund_rejected',
      entityType: 'invoice_refund',
      entityId: refundId,
    });

    response.json({ data });
  })
);

router.post(
  '/:invoiceId/pay',
  requireRoles('admin'),
  asyncHandler(async (request, response) => {
    const { invoiceId } = request.params;

    const { data: existingInvoice, error: existingError } = await supabaseAdmin
      .from('invoices')
      .select('id, status, amount, invoice_payments(amount)')
      .eq('id', invoiceId)
      .single();

    if (existingError) throw fromSupabaseError(existingError, { code: 'INVOICE_FETCH_FAILED' });

    if (existingInvoice.status === 'paid') {
      throw new AppError({ status: 409, code: 'INVOICE_ALREADY_PAID', message: 'Invoice already paid' });
    }

    const paidAmount = (existingInvoice.invoice_payments || []).reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );
    const remaining = Number(existingInvoice.amount) - paidAmount;

    if (remaining <= 0) {
      throw new AppError({ status: 409, code: 'NO_REMAINING_BALANCE', message: 'No remaining balance to pay' });
    }

    const { data, error } = await supabaseAdmin.rpc('record_invoice_payment', {
      p_invoice_id: invoiceId,
      p_amount: remaining,
      p_user_id: request.user.id,
      p_note: 'Marked fully paid by admin',
    });

    if (error) throw fromSupabaseError(error, { code: 'INVOICE_PAY_FAILED' });

    await writeAuditLog({
      userId: request.user.id,
      action: 'invoice_marked_paid',
      entityType: 'invoice',
      entityId: invoiceId,
    });

    response.json({ data });
  })
);

export default router;
