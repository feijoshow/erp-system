import { ZodError } from 'zod';
import { AppError } from '../utils/appError.js';

export function notFoundHandler(request, _response, next) {
  next(
    new AppError({
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      message: `Route not found: ${request.originalUrl}`,
    })
  );
}

export function errorHandler(error, _request, response, _next) {
  if (error instanceof ZodError) {
    return response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues,
      },
    });
  }

  if (error instanceof AppError) {
    return response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }

  console.error(error);
  return response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: error?.message || 'Internal server error',
      details: null,
    },
  });
}
