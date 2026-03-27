import { writeAuditLog } from './auditLogService.js';
import { supabaseAdmin } from './supabaseAdmin.js';
import { fromSupabaseError, NotFoundError, StockError } from '../utils/appError.js';

export async function listProducts({
  from,
  to,
  search = '',
  stockFilter = 'all',
  sortBy = 'created_at',
  sortDir = 'desc',
}) {
  const sortable = {
    name: 'name',
    sku: 'sku',
    price: 'price',
    stock: 'stock_qty',
    created_at: 'created_at',
  };

  const sortColumn = sortable[sortBy] || 'created_at';

  let query = supabaseAdmin.from('products').select('*', { count: 'exact' });

  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  }

  if (stockFilter === 'low') {
    query = query.lte('stock_qty', 10);
  }

  if (stockFilter === 'healthy') {
    query = query.gt('stock_qty', 10);
  }

  const { data, error, count } = await query
    .order(sortColumn, { ascending: sortDir === 'asc', nullsFirst: false })
    .range(from, to);

  if (error) throw fromSupabaseError(error, { code: 'PRODUCTS_FETCH_FAILED' });

  return { data: data || [], total: count || 0 };
}

export async function createProduct({ userId, input }) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      name: input.name,
      sku: input.sku,
      price: input.price,
      stock_qty: input.stockQty,
      image_url: input.imageUrl || null,
    })
    .select('*')
    .single();

  if (error) throw fromSupabaseError(error, { code: 'PRODUCT_CREATE_FAILED' });

  await writeAuditLog({
    userId,
    action: 'product_created',
    entityType: 'product',
    entityId: data.id,
  });

  return data;
}

export async function adjustProductStock({ productId, userId, input }) {
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, name, stock_qty')
    .eq('id', productId)
    .single();

  if (productError) {
    if (productError.code === 'PGRST116') {
      throw new NotFoundError({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product not found',
        details: { productId },
      });
    }

    throw fromSupabaseError(productError, { code: 'PRODUCT_FETCH_FAILED' });
  }

  const nextStock = product.stock_qty + input.deltaQty;
  if (nextStock < 0) {
    throw new StockError({
      code: 'NEGATIVE_STOCK_NOT_ALLOWED',
      message: 'Stock adjustment would make inventory negative',
      details: { currentStock: product.stock_qty, deltaQty: input.deltaQty },
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
    delta_qty: input.deltaQty,
    reason: input.reason,
    adjusted_by: userId,
  });

  if (adjustmentError) throw fromSupabaseError(adjustmentError, { code: 'ADJUSTMENT_LOG_FAILED' });

  await writeAuditLog({
    userId,
    action: 'stock_adjusted',
    entityType: 'product',
    entityId: productId,
  });

  return data;
}
