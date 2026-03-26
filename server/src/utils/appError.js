export class AppError extends Error {
  constructor({ status = 500, code = 'INTERNAL_ERROR', message = 'Internal server error', details = null }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
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
