import { Router } from 'express';
import { requireRoles } from '../../middleware/auth.js';
import { createProductSchema, adjustStockSchema } from '../../schemas/products.schemas.js';
import { adjustProductStock, createProduct, listProducts } from '../../services/productService.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPageMeta, getPagination } from '../../utils/pagination.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (request, response) => {
    const { page, pageSize, from, to } = getPagination(request.query);
    const search = String(request.query.q || '').trim();
    const stockFilter = String(request.query.stockFilter || 'all');
    const sortBy = String(request.query.sortBy || 'created_at');
    const sortDir = String(request.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const { data, total } = await listProducts({
      from,
      to,
      search,
      stockFilter,
      sortBy,
      sortDir,
    });

    response.json({
      data,
      meta: getPageMeta({ page, pageSize, total }),
    });
  })
);

router.post(
  '/',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const body = createProductSchema.parse(request.body);
    const data = await createProduct({ userId: request.user.id, input: body });

    response.status(201).json({ data });
  })
);

router.post(
  '/:productId/adjust-stock',
  requireRoles('inventory', 'admin'),
  asyncHandler(async (request, response) => {
    const { productId } = request.params;
    const body = adjustStockSchema.parse(request.body);
    const data = await adjustProductStock({
      productId,
      userId: request.user.id,
      input: body,
    });

    response.json({ data });
  })
);

export default router;
