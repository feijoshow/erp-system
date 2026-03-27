import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(2),
  price: z.number().nonnegative(),
  stockQty: z.number().int().nonnegative(),
  imageUrl: z.string().url().optional(),
});

export const adjustStockSchema = z.object({
  deltaQty: z.number().int().refine((value) => value !== 0, 'deltaQty cannot be zero'),
  reason: z.string().min(3).max(300),
});
