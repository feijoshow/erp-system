import { Router } from 'express';
import { z } from 'zod';
import { requireRoles } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../services/supabaseAdmin.js';
import { writeAuditLog } from '../../services/auditLogService.js';
import { fromSupabaseError } from '../../utils/appError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPageMeta, getPagination } from '../../utils/pagination.js';

const router = Router();

const createProductSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(2),
  price: z.number().nonnegative(),
  stockQty: z.number().int().nonnegative(),
  imageUrl: z.string().url().optional(),
});

const adjustStockSchema = z.object({
  deltaQty: z.number().int().refine((value) => value !== 0, 'deltaQty cannot be zero'),
  reason: z.string().min(3).max(300),
});

router.get(
  '/',
  asyncHandler(async (request, response) => {
    const { page, pageSize, from, to } = getPagination(request.query);

    const { data, error, count } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact' })
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw fromSupabaseError(error, { code: 'PRODUCTS_FETCH_FAILED' });

    response.json({
      data,
      meta: getPageMeta({ page, pageSize, total: count || 0 }),
    });
  })
);

router.post(
  '/',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const body = createProductSchema.parse(request.body);

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        name: body.name,
        sku: body.sku,
        price: body.price,
        stock_qty: body.stockQty,
        image_url: body.imageUrl || null,
      })
      .select('*')
      .single();

    if (error) throw fromSupabaseError(error, { code: 'PRODUCT_CREATE_FAILED' });

    await writeAuditLog({
      userId: request.user.id,
      action: 'product_created',
      entityType: 'product',
      entityId: data.id,
    });

    response.status(201).json({ data });
  })
);

router.post(
  '/:productId/adjust-stock',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const { productId } = request.params;
    const body = adjustStockSchema.parse(request.body);

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, name, stock_qty')
      .eq('id', productId)
      .single();

    if (productError) throw fromSupabaseError(productError, { code: 'PRODUCT_FETCH_FAILED' });

    const nextStock = product.stock_qty + body.deltaQty;
    if (nextStock < 0) {
      return response.status(409).json({
        error: {
          code: 'NEGATIVE_STOCK_NOT_ALLOWED',
          message: 'Stock adjustment would make inventory negative',
          details: { currentStock: product.stock_qty, deltaQty: body.deltaQty },
        },
      });
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ stock_qty: nextStock })
      .eq('id', productId)
      .select('*')
      .single();

    if (error) throw fromSupabaseError(error, { code: 'STOCK_ADJUST_FAILED' });

    const { error: adjustmentError } = await supabaseAdmin.from('inventory_adjustments').insert({
      product_id: productId,
      delta_qty: body.deltaQty,
      reason: body.reason,
      adjusted_by: request.user.id,
    });

    if (adjustmentError) throw fromSupabaseError(adjustmentError, { code: 'ADJUSTMENT_LOG_FAILED' });

    await writeAuditLog({
      userId: request.user.id,
      action: 'stock_adjusted',
      entityType: 'product',
      entityId: productId,
    });

    response.json({ data });
  })
);

export default router;
