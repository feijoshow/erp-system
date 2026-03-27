import { Router } from 'express';
import { z } from 'zod';
import { requireRoles } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../services/supabaseAdmin.js';
import { writeAuditLog } from '../../services/auditLogService.js';
import { AppError, fromSupabaseError } from '../../utils/appError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPageMeta, getPagination } from '../../utils/pagination.js';

const router = Router();

const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
});

const createReturnSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().min(3).max(300),
});

const rejectReturnSchema = z.object({
  reason: z.string().min(3).max(300),
});

router.get(
  '/',
  asyncHandler(async (request, response) => {
    const { page, pageSize, from, to } = getPagination(request.query);
    const search = String(request.query.q || '').trim();
    const statusFilter = String(request.query.status || 'all');
    const sortBy = String(request.query.sortBy || 'created_at');
    const sortDir = String(request.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const sortable = {
      id: 'id',
      status: 'status',
      total: 'total_amount',
      date: 'created_at',
      created_at: 'created_at',
    };

    const sortColumn = sortable[sortBy] || 'created_at';

    let query = supabaseAdmin
      .from('orders')
      .select('id, customer_id, created_by, total_amount, status, created_at, customers(full_name)', {
        count: 'exact',
      });

    if (search) {
      query = query.or(`id.ilike.%${search}%,status.ilike.%${search}%`);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error, count } = await query
      .order(sortColumn, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(from, to);

    if (error) throw fromSupabaseError(error, { code: 'ORDERS_FETCH_FAILED' });

    const normalized = (data || []).map((order) => ({
      ...order,
      customer_name: order.customers?.full_name || null,
    }));

    response.json({
      data: normalized,
      meta: getPageMeta({ page, pageSize, total: count || 0 }),
    });
  })
);

router.post(
  '/',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const body = createOrderSchema.parse(request.body);
    const rpcItems = body.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    }));

    const { data: txResult, error: txError } = await supabaseAdmin.rpc('create_order_with_invoice', {
      p_user_id: request.user.id,
      p_customer_id: body.customerId,
      p_items: rpcItems,
    });

    if (txError) {
      if (txError.message?.includes('Insufficient stock')) {
        throw new AppError({ status: 409, code: 'INSUFFICIENT_STOCK', message: txError.message });
      }

      throw fromSupabaseError(txError, {
        code: 'ORDER_TRANSACTION_FAILED',
        message: 'Order creation transaction failed',
      });
    }

    await writeAuditLog({
      userId: request.user.id,
      action: 'order_created',
      entityType: 'order',
      entityId: txResult.order_id,
    });

    response.status(201).json({ data: txResult });
  })
);

router.get(
  '/:orderId/items',
  asyncHandler(async (request, response) => {
    const { orderId } = request.params;

    const { data, error } = await supabaseAdmin
      .from('order_items')
      .select('id, order_id, product_id, quantity, unit_price, line_total, products(name, sku)')
      .eq('order_id', orderId)
      .order('id', { ascending: true });

    if (error) throw fromSupabaseError(error, { code: 'ORDER_ITEMS_FETCH_FAILED' });

    response.json({ data });
  })
);

router.post(
  '/:orderId/returns',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const { orderId } = request.params;
    const body = createReturnSchema.parse(request.body);

    const { data, error } = await supabaseAdmin.rpc('create_order_return', {
      p_order_id: orderId,
      p_product_id: body.productId,
      p_quantity: body.quantity,
      p_user_id: request.user.id,
      p_reason: body.reason,
    });

    if (error) {
      throw fromSupabaseError(error, {
        code: 'ORDER_RETURN_FAILED',
        message: error.message || 'Could not process return',
      });
    }

    await writeAuditLog({
      userId: request.user.id,
      action: 'order_return_created',
      entityType: 'order',
      entityId: orderId,
    });

    response.status(201).json({ data });
  })
);

router.get(
  '/returns/list',
  requireRoles('sales', 'admin'),
  asyncHandler(async (request, response) => {
    const { page, pageSize, from, to } = getPagination(request.query);
    const search = String(request.query.q || '').trim();
    const statusFilter = String(request.query.status || 'all');
    const sortBy = String(request.query.sortBy || 'created_at');
    const sortDir = String(request.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const sortable = {
      id: 'id',
      order: 'order_id',
      status: 'status',
      created: 'created_at',
      created_at: 'created_at',
    };

    const sortColumn = sortable[sortBy] || 'created_at';

    let query = supabaseAdmin
      .from('order_returns')
      .select(
        'id, order_id, reason, status, decision_note, approved_at, created_at, order_return_items(id, product_id, quantity, line_total, products(name))',
        { count: 'exact' }
      );

    if (search) {
      query = query.or(
        `id.ilike.%${search}%,order_id.ilike.%${search}%,status.ilike.%${search}%,reason.ilike.%${search}%,decision_note.ilike.%${search}%`
      );
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error, count } = await query
      .order(sortColumn, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(from, to);

    if (error) throw fromSupabaseError(error, { code: 'ORDER_RETURNS_FETCH_FAILED' });

    response.json({
      data,
      meta: getPageMeta({ page, pageSize, total: count || 0 }),
    });
  })
);

router.post(
  '/returns/:returnId/approve',
  requireRoles('admin'),
  asyncHandler(async (request, response) => {
    const { returnId } = request.params;

    const { data, error } = await supabaseAdmin.rpc('approve_order_return', {
      p_order_return_id: returnId,
      p_user_id: request.user.id,
    });

    if (error) {
      throw fromSupabaseError(error, {
        code: 'ORDER_RETURN_APPROVAL_FAILED',
        message: error.message || 'Could not approve return request',
      });
    }

    await writeAuditLog({
      userId: request.user.id,
      action: 'order_return_approved',
      entityType: 'order_return',
      entityId: returnId,
    });

    response.json({ data });
  })
);

router.post(
  '/returns/:returnId/reject',
  requireRoles('admin'),
  asyncHandler(async (request, response) => {
    const { returnId } = request.params;
    const body = rejectReturnSchema.parse(request.body);

    const { data, error } = await supabaseAdmin.rpc('reject_order_return', {
      p_order_return_id: returnId,
      p_user_id: request.user.id,
      p_reason: body.reason,
    });

    if (error) {
      throw fromSupabaseError(error, {
        code: 'ORDER_RETURN_REJECTION_FAILED',
        message: error.message || 'Could not reject return request',
      });
    }

    await writeAuditLog({
      userId: request.user.id,
      action: 'order_return_rejected',
      entityType: 'order_return',
      entityId: returnId,
    });

    response.json({ data });
  })
);

export default router;
