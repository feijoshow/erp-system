import { AppError } from './appError.js';

const MAX_PAGE_SIZE = 100;

export function getPagination(query) {
  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 20);

  if (!Number.isInteger(page) || page < 1) {
    throw new AppError({ status: 400, code: 'INVALID_PAGE', message: 'page must be an integer >= 1' });
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new AppError({
      status: 400,
      code: 'INVALID_PAGE_SIZE',
      message: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`,
    });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}

export function getPageMeta({ page, pageSize, total = 0 }) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
