import { Router } from 'express';
import { z } from 'zod';
import { requireRoles } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../services/supabaseAdmin.js';
import { writeAuditLog } from '../../services/auditLogService.js';
import { env } from '../../config/env.js';
import { AppError, fromSupabaseError } from '../../utils/appError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPageMeta, getPagination } from '../../utils/pagination.js';

const router = Router();

const createSupplierSchema = z.object({
  name: z.string().min(2).max(120),
  contactEmail: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
});

const poItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitCost: z.number().positive(),
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  expectedDate: z.string().optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
  items: z.array(poItemSchema).min(1),
});

const receivePurchaseOrderSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantityReceived: z.number().int().positive(),
      })
    )
    .min(1),
});

const procurementAnalyticsQuerySchema = z.object({
  months: z.coerce.number().int().min(3).max(24).optional(),
});

function parseDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysBetween(startValue, endValue) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);

  if (!start || !end) {
    return null;
  }

  return Math.max(Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)), 0);
}

function monthKey(value) {
  const date = parseDate(value);
  if (!date) {
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

router.get(
  '/suppliers',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const search = String(request.query.q || '').trim();

    let query = supabaseAdmin
      .from('suppliers')
      .select('id, name, contact_email, phone, lead_time_days, is_active, created_at')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (search) {
      query = query.or(`name.ilike.%${search}%,contact_email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw fromSupabaseError(error, { code: 'SUPPLIERS_FETCH_FAILED' });

    response.json({ data: data || [] });
  })
);

router.post(
  '/suppliers',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const body = createSupplierSchema.parse(request.body);

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .insert({
        name: body.name,
        contact_email: body.contactEmail || null,
        phone: body.phone || null,
        lead_time_days: body.leadTimeDays ?? 7,
        is_active: true,
      })
      .select('id, name, contact_email, phone, lead_time_days, is_active, created_at')
      .single();

    if (error) throw fromSupabaseError(error, { code: 'SUPPLIER_CREATE_FAILED' });

    await writeAuditLog({
      userId: request.user.id,
      action: 'supplier_created',
      entityType: 'supplier',
      entityId: data.id,
    });

    response.status(201).json({ data });
  })
);

router.get(
  '/purchase-orders',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const { page, pageSize, from, to } = getPagination(request.query);
    const search = String(request.query.q || '').trim();
    const status = String(request.query.status || 'all');

    let query = supabaseAdmin
      .from('purchase_orders')
      .select('id, supplier_id, created_by, status, expected_date, notes, total_amount, created_at, received_at, suppliers(name)', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search) {
      query = query.or(`id.ilike.%${search}%,notes.ilike.%${search}%`);
    }

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;
    if (error) throw fromSupabaseError(error, { code: 'PURCHASE_ORDERS_FETCH_FAILED' });

    const normalized = (data || []).map((row) => ({
      ...row,
      supplier_name: row.suppliers?.name || null,
    }));

    response.json({
      data: normalized,
      meta: getPageMeta({ page, pageSize, total: count || 0 }),
    });
  })
);

router.get(
  '/analytics',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const { months = 6 } = procurementAnalyticsQuerySchema.parse(request.query || {});
    const rangeKeys = makeMonthRange(months);
    const rangeSet = new Set(rangeKeys);

    const { data: suppliers, error: suppliersError } = await supabaseAdmin
      .from('suppliers')
      .select('id, name, lead_time_days, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (suppliersError) throw fromSupabaseError(suppliersError, { code: 'PROCUREMENT_ANALYTICS_SUPPLIERS_FAILED' });

    const { data: purchaseOrders, error: poError } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, supplier_id, status, created_at, expected_date, received_at, total_amount, purchase_order_items(quantity, received_qty, line_total)')
      .gte('created_at', `${rangeKeys[0]}-01T00:00:00.000Z`)
      .order('created_at', { ascending: true });

    if (poError) throw fromSupabaseError(poError, { code: 'PROCUREMENT_ANALYTICS_PO_FAILED' });

    const supplierStats = new Map(
      (suppliers || []).map((supplier) => [
        supplier.id,
        {
          supplierId: supplier.id,
          supplierName: supplier.name,
          baselineLeadDays: supplier.lead_time_days,
          receivedOrders: 0,
          avgLeadDays: 0,
          avgVarianceDays: 0,
          onTimeRate: 0,
          _leadTotal: 0,
          _varianceTotal: 0,
          _onTimeCount: 0,
        },
      ])
    );

    const cycleMap = new Map(
      rangeKeys.map((key) => [
        key,
        { month: monthLabelFromKey(key), monthKey: key, receivedOrders: 0, avgCycleDays: 0, _cycleTotal: 0 },
      ])
    );

    const fillRateMap = new Map(
      rangeKeys.map((key) => [
        key,
        {
          month: monthLabelFromKey(key),
          monthKey: key,
          orderedQty: 0,
          receivedQty: 0,
          fillRate: 0,
          receivedValue: 0,
        },
      ])
    );

    (purchaseOrders || []).forEach((purchaseOrder) => {
      const key = monthKey(purchaseOrder.created_at);
      if (!key || !rangeSet.has(key)) {
        return;
      }

      const cycleBucket = cycleMap.get(key);
      const fillRateBucket = fillRateMap.get(key);

      const items = purchaseOrder.purchase_order_items || [];
      const orderedQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const receivedQty = items.reduce((sum, item) => sum + Number(item.received_qty || 0), 0);
      const receivedValue = items.reduce((sum, item) => {
        const lineTotal = Number(item.line_total || 0);
        const itemQty = Number(item.quantity || 0);
        const itemReceived = Number(item.received_qty || 0);
        if (itemQty <= 0) {
          return sum;
        }
        return sum + (lineTotal * itemReceived) / itemQty;
      }, 0);

      fillRateBucket.orderedQty += orderedQty;
      fillRateBucket.receivedQty += receivedQty;
      fillRateBucket.receivedValue += receivedValue;

      if (purchaseOrder.received_at) {
        const supplierBucket = supplierStats.get(purchaseOrder.supplier_id);
        const leadDays = daysBetween(purchaseOrder.created_at, purchaseOrder.received_at);
        const variance = leadDays == null ? null : leadDays - Number(supplierBucket?.baselineLeadDays || 0);
        const expectedDate = parseDate(purchaseOrder.expected_date);
        const receivedDate = parseDate(purchaseOrder.received_at);
        const isOnTime = expectedDate && receivedDate ? receivedDate.getTime() <= expectedDate.getTime() : null;

        if (supplierBucket && leadDays != null) {
          supplierBucket.receivedOrders += 1;
          supplierBucket._leadTotal += leadDays;
          supplierBucket._varianceTotal += variance || 0;

          if (isOnTime === true) {
            supplierBucket._onTimeCount += 1;
          }
        }

        if (leadDays != null) {
          cycleBucket.receivedOrders += 1;
          cycleBucket._cycleTotal += leadDays;
        }
      }
    });

    const supplierLeadVariance = [...supplierStats.values()].map((bucket) => {
      const denominator = Math.max(bucket.receivedOrders, 1);
      return {
        supplierId: bucket.supplierId,
        supplierName: bucket.supplierName,
        baselineLeadDays: bucket.baselineLeadDays,
        receivedOrders: bucket.receivedOrders,
        avgLeadDays: Number((bucket._leadTotal / denominator).toFixed(1)),
        avgVarianceDays: Number((bucket._varianceTotal / denominator).toFixed(1)),
        onTimeRate: Number(((bucket._onTimeCount / denominator) * 100).toFixed(1)),
      };
    });

    const poCycleTimeTrend = [...cycleMap.values()].map((bucket) => ({
      month: bucket.month,
      monthKey: bucket.monthKey,
      receivedOrders: bucket.receivedOrders,
      avgCycleDays: Number(
        (bucket.receivedOrders > 0 ? bucket._cycleTotal / bucket.receivedOrders : 0).toFixed(1)
      ),
    }));

    const fillRateTrend = [...fillRateMap.values()].map((bucket) => ({
      month: bucket.month,
      monthKey: bucket.monthKey,
      orderedQty: Number(bucket.orderedQty.toFixed(2)),
      receivedQty: Number(bucket.receivedQty.toFixed(2)),
      fillRate: Number(
        (bucket.orderedQty > 0 ? (bucket.receivedQty / bucket.orderedQty) * 100 : 0).toFixed(1)
      ),
      receivedValue: Number(bucket.receivedValue.toFixed(2)),
    }));

    response.json({
      data: {
        months,
        generatedAt: new Date().toISOString(),
        supplierLeadVariance,
        poCycleTimeTrend,
        fillRateTrend,
      },
    });
  })
);

router.post(
  '/purchase-orders',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const body = createPurchaseOrderSchema.parse(request.body);

    const productIds = [...new Set(body.items.map((item) => item.productId))];
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id')
      .in('id', productIds);

    if (productsError) throw fromSupabaseError(productsError, { code: 'PO_PRODUCTS_FETCH_FAILED' });

    const existing = new Set((products || []).map((product) => product.id));
    const missing = productIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new AppError({
        status: 400,
        code: 'PO_PRODUCT_NOT_FOUND',
        message: 'Some products for this purchase order are invalid.',
        details: { missing },
      });
    }

    const totalAmount = body.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
      0
    );

    const requiresAdminApproval = Number(totalAmount.toFixed(2)) >= Number(env.procurementApprovalThreshold || 0);

    const { data: order, error: orderError } = await supabaseAdmin
      .from('purchase_orders')
      .insert({
        supplier_id: body.supplierId,
        created_by: request.user.id,
        status: requiresAdminApproval ? 'pending_approval' : 'pending',
        expected_date: body.expectedDate || null,
        notes: body.notes || null,
        total_amount: Number(totalAmount.toFixed(2)),
      })
      .select('id, supplier_id, created_by, status, expected_date, notes, total_amount, created_at, received_at')
      .single();

    if (orderError) throw fromSupabaseError(orderError, { code: 'PURCHASE_ORDER_CREATE_FAILED' });

    const lineItems = body.items.map((item) => ({
      purchase_order_id: order.id,
      product_id: item.productId,
      quantity: item.quantity,
      unit_cost: Number(item.unitCost.toFixed(2)),
      line_total: Number((item.quantity * item.unitCost).toFixed(2)),
      received_qty: 0,
    }));

    const { error: itemError } = await supabaseAdmin.from('purchase_order_items').insert(lineItems);

    if (itemError) {
      await supabaseAdmin.from('purchase_orders').delete().eq('id', order.id);
      throw fromSupabaseError(itemError, { code: 'PURCHASE_ORDER_ITEMS_CREATE_FAILED' });
    }

    await writeAuditLog({
      userId: request.user.id,
      action: requiresAdminApproval ? 'purchase_order_created_pending_admin_approval' : 'purchase_order_created',
      entityType: 'purchase_order',
      entityId: order.id,
      note: requiresAdminApproval
        ? `Amount ${Number(totalAmount.toFixed(2))} exceeds threshold ${Number(env.procurementApprovalThreshold || 0)}`
        : '',
    });

    response.status(201).json({ data: order });
  })
);

router.get(
  '/purchase-orders/:purchaseOrderId/items',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const { purchaseOrderId } = request.params;

    const { data, error } = await supabaseAdmin
      .from('purchase_order_items')
      .select('id, purchase_order_id, product_id, quantity, received_qty, unit_cost, line_total, products(name, sku)')
      .eq('purchase_order_id', purchaseOrderId)
      .order('id', { ascending: true });

    if (error) throw fromSupabaseError(error, { code: 'PURCHASE_ORDER_ITEMS_FETCH_FAILED' });

    response.json({ data: data || [] });
  })
);

router.post(
  '/purchase-orders/:purchaseOrderId/approve',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const { purchaseOrderId } = request.params;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status')
      .eq('id', purchaseOrderId)
      .single();

    if (existingError) throw fromSupabaseError(existingError, { code: 'PURCHASE_ORDER_FETCH_FAILED' });

    if (!['pending', 'pending_approval'].includes(existing.status)) {
      throw new AppError({
        status: 409,
        code: 'PURCHASE_ORDER_APPROVE_NOT_ALLOWED',
        message: `Only pending purchase orders can be approved. Current status: ${existing.status}`,
      });
    }

    if (existing.status === 'pending_approval' && request.profile?.role !== 'admin') {
      throw new AppError({
        status: 403,
        code: 'PURCHASE_ORDER_ADMIN_OVERRIDE_REQUIRED',
        message: 'This purchase order exceeds approval threshold and requires admin override.',
      });
    }

    const { data, error } = await supabaseAdmin
      .from('purchase_orders')
      .update({ status: 'approved' })
      .eq('id', purchaseOrderId)
      .select('id, supplier_id, created_by, status, expected_date, notes, total_amount, created_at, received_at')
      .single();

    if (error) throw fromSupabaseError(error, { code: 'PURCHASE_ORDER_APPROVE_FAILED' });

    await writeAuditLog({
      userId: request.user.id,
      action: 'purchase_order_approved',
      entityType: 'purchase_order',
      entityId: purchaseOrderId,
      note: existing.status === 'pending_approval' ? 'Admin override approval applied' : '',
    });

    response.json({ data });
  })
);

router.post(
  '/purchase-orders/:purchaseOrderId/receive',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const { purchaseOrderId } = request.params;
    const hasBodyItems = request.body && Array.isArray(request.body.items) && request.body.items.length > 0;
    const body = hasBodyItems ? receivePurchaseOrderSchema.parse(request.body) : null;

    const { data: purchaseOrder, error: poError } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status')
      .eq('id', purchaseOrderId)
      .single();

    if (poError) throw fromSupabaseError(poError, { code: 'PURCHASE_ORDER_FETCH_FAILED' });

    if (purchaseOrder.status === 'received') {
      throw new AppError({
        status: 409,
        code: 'PURCHASE_ORDER_ALREADY_RECEIVED',
        message: 'Purchase order has already been received.',
      });
    }

    if (purchaseOrder.status === 'cancelled') {
      throw new AppError({
        status: 409,
        code: 'PURCHASE_ORDER_CANCELLED',
        message: 'Cancelled purchase orders cannot be received.',
      });
    }

    if (purchaseOrder.status === 'pending_approval') {
      throw new AppError({
        status: 409,
        code: 'PURCHASE_ORDER_NOT_APPROVED',
        message: 'Purchase order requires admin approval before receiving.',
      });
    }

    if (!['approved', 'partial_received', 'pending'].includes(purchaseOrder.status)) {
      throw new AppError({
        status: 409,
        code: 'PURCHASE_ORDER_RECEIVE_NOT_ALLOWED',
        message: `Purchase order in ${purchaseOrder.status} cannot be received.`,
      });
    }

    const { data: items, error: itemsError } = await supabaseAdmin
      .from('purchase_order_items')
      .select('id, product_id, quantity, received_qty')
      .eq('purchase_order_id', purchaseOrderId);

    if (itemsError) throw fromSupabaseError(itemsError, { code: 'PURCHASE_ORDER_ITEMS_FETCH_FAILED' });

    const itemById = new Map((items || []).map((item) => [item.id, item]));

    let receivePlan = [];
    if (body?.items?.length) {
      receivePlan = body.items.map((input) => {
        const target = itemById.get(input.itemId);
        if (!target) {
          throw new AppError({
            status: 400,
            code: 'PURCHASE_ORDER_RECEIVE_ITEM_INVALID',
            message: `Item ${input.itemId} does not belong to this purchase order.`,
          });
        }

        const remaining = Number(target.quantity || 0) - Number(target.received_qty || 0);
        if (remaining <= 0) {
          throw new AppError({
            status: 409,
            code: 'PURCHASE_ORDER_RECEIVE_ITEM_FULL',
            message: `Item ${input.itemId} is already fully received.`,
          });
        }

        if (Number(input.quantityReceived) > remaining) {
          throw new AppError({
            status: 409,
            code: 'PURCHASE_ORDER_RECEIVE_ITEM_EXCESS',
            message: `Cannot receive ${input.quantityReceived} for item ${input.itemId}; remaining is ${remaining}.`,
          });
        }

        return {
          ...target,
          receiveQty: Number(input.quantityReceived),
        };
      });
    } else {
      receivePlan = (items || [])
        .map((item) => ({
          ...item,
          receiveQty: Math.max(Number(item.quantity || 0) - Number(item.received_qty || 0), 0),
        }))
        .filter((item) => item.receiveQty > 0);
    }

    if (receivePlan.length === 0) {
      throw new AppError({
        status: 409,
        code: 'PURCHASE_ORDER_RECEIVE_NOTHING',
        message: 'No receivable quantities found for this purchase order.',
      });
    }

    for (const item of receivePlan) {
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('id, stock_qty')
        .eq('id', item.product_id)
        .single();

      if (productError) throw fromSupabaseError(productError, { code: 'PO_RECEIVE_PRODUCT_FETCH_FAILED' });

      const nextStock = Number(product.stock_qty || 0) + Number(item.receiveQty || 0);

      const { error: updateProductError } = await supabaseAdmin
        .from('products')
        .update({ stock_qty: nextStock })
        .eq('id', item.product_id);

      if (updateProductError) throw fromSupabaseError(updateProductError, { code: 'PO_RECEIVE_STOCK_UPDATE_FAILED' });

      const { error: adjustError } = await supabaseAdmin.from('inventory_adjustments').insert({
        product_id: item.product_id,
        delta_qty: Number(item.receiveQty || 0),
        reason: `PO partial receipt ${purchaseOrderId}`,
        adjusted_by: request.user.id,
      });

      if (adjustError) throw fromSupabaseError(adjustError, { code: 'PO_RECEIVE_ADJUSTMENT_LOG_FAILED' });

      const { error: updateItemError } = await supabaseAdmin
        .from('purchase_order_items')
        .update({ received_qty: Number(item.received_qty || 0) + Number(item.receiveQty || 0) })
        .eq('id', item.id);

      if (updateItemError) throw fromSupabaseError(updateItemError, { code: 'PO_RECEIVE_ITEM_UPDATE_FAILED' });
    }

    const { data: postReceiveItems, error: postReceiveItemsError } = await supabaseAdmin
      .from('purchase_order_items')
      .select('id, quantity, received_qty')
      .eq('purchase_order_id', purchaseOrderId);

    if (postReceiveItemsError) throw fromSupabaseError(postReceiveItemsError, { code: 'PO_RECEIVE_RECHECK_FAILED' });

    const allReceived = (postReceiveItems || []).every(
      (item) => Number(item.received_qty || 0) >= Number(item.quantity || 0)
    );

    const { data, error } = await supabaseAdmin
      .from('purchase_orders')
      .update({
        status: allReceived ? 'received' : 'partial_received',
        received_at: allReceived ? new Date().toISOString() : null,
      })
      .eq('id', purchaseOrderId)
      .select('id, supplier_id, created_by, status, expected_date, notes, total_amount, created_at, received_at')
      .single();

    if (error) throw fromSupabaseError(error, { code: 'PURCHASE_ORDER_RECEIVE_FAILED' });

    await writeAuditLog({
      userId: request.user.id,
      action: allReceived ? 'purchase_order_received' : 'purchase_order_partially_received',
      entityType: 'purchase_order',
      entityId: purchaseOrderId,
      note: `Lines updated: ${receivePlan.length}`,
    });

    response.json({ data });
  })
);

export default router;
