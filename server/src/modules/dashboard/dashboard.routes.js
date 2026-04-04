import { Router } from 'express';
import { z } from 'zod';
import { requireRoles } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../services/supabaseAdmin.js';
import { fromSupabaseError } from '../../utils/appError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

const activityLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  scope: z.enum(['approvals', 'all']).optional(),
});

router.get(
  '/',
  asyncHandler(async (_request, response) => {
    const [productsResult, customersResult, ordersResult, unpaidInvoicesResult, lowStockResult, paymentsResult] = await Promise.all([
      supabaseAdmin.from('products').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('customers').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'unpaid'),
      supabaseAdmin.from('products').select('id, name, sku, stock_qty').lte('stock_qty', 5).order('stock_qty', { ascending: true }),
      supabaseAdmin.from('invoice_payments').select('amount'),
    ]);

    const paidRevenue = (paymentsResult.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const payload = {
      totalProducts: productsResult.count || 0,
      totalCustomers: customersResult.count || 0,
      totalOrders: ordersResult.count || 0,
      unpaidInvoices: unpaidInvoicesResult.count || 0,
      paidRevenue: Number(paidRevenue.toFixed(2)),
      lowStockProducts: lowStockResult.data || [],
    };

    response.json({ data: payload });
  })
);

router.get(
  '/activity-logs',
  requireRoles('admin'),
  asyncHandler(async (request, response) => {
    const { limit = 25, scope = 'approvals' } = activityLogsQuerySchema.parse(request.query || {});

    let query = supabaseAdmin
      .from('activity_logs')
      .select('id, user_id, action, entity_type, entity_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (scope === 'approvals') {
      query = query.in('entity_type', ['order', 'order_return', 'invoice_refund']);
    }

    const { data, error } = await query;

    if (error) throw fromSupabaseError(error, { code: 'ACTIVITY_LOGS_FETCH_FAILED' });

    const actorIds = [...new Set((data || []).map((log) => log.user_id).filter(Boolean))];
    const actorNames = new Map();

    if (actorIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', actorIds);

      if (profilesError) throw fromSupabaseError(profilesError, { code: 'ACTIVITY_LOG_ACTORS_FETCH_FAILED' });

      (profiles || []).forEach((profile) => {
        actorNames.set(profile.id, profile.full_name || null);
      });
    }

    const enriched = (data || []).map((log) => ({
      ...log,
      actor_name: actorNames.get(log.user_id) || null,
    }));

    response.json({ data: enriched });
  })
);

export default router;
