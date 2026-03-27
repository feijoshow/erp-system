export class AppError extends Error {
  constructor({ status = 500, code = 'INTERNAL_ERROR', message = 'Internal server error', details = null }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor({ code = 'VALIDATION_ERROR', message = 'Request validation failed', details = null }) {
    super({ status: 400, code, message, details });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor({ code = 'NOT_FOUND', message = 'Resource not found', details = null }) {
    super({ status: 404, code, message, details });
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends AppError {
  constructor({ code = 'FORBIDDEN', message = 'You do not have permission to perform this action', details = null }) {
    super({ status: 403, code, message, details });
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor({ code = 'CONFLICT', message = 'Resource conflict', details = null }) {
    super({ status: 409, code, message, details });
    this.name = 'ConflictError';
  }
}

export class StockError extends ConflictError {
  constructor({ code = 'STOCK_ERROR', message = 'Stock operation failed', details = null }) {
    super({ code, message, details });
    this.name = 'StockError';
  }
}

export function fromSupabaseError(error, fallback = {}) {
  const status = fallback.status || 400;
  const code = fallback.code || 'DATABASE_ERROR';
  const message = error?.message || fallback.message || 'Database operation failed';

  return new AppError({
    status,
    code,
    message,
    details: {
      postgresCode: error?.code || null,
      hint: error?.hint || null,
      details: error?.details || null,
    },
  });
}
