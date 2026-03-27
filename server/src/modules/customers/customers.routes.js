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
