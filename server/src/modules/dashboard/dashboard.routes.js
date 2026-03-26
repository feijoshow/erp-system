import { Router } from 'express';
import { supabaseAdmin } from '../../services/supabaseAdmin.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

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

export default router;
