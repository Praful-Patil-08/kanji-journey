'use strict';

// Centralized error handler — never leak stack traces to client
// Consistent shape: { error: string, code?: string, details?: any }

function notFound(req, res, next) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' });
}

function errorHandler(err, req, res, _next) {
  const isDev = process.env.NODE_ENV !== 'production';
  const status = err.status || err.statusCode || 500;
  const code = err.code || (status === 404 ? 'NOT_FOUND' : status === 400 ? 'BAD_REQUEST' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR');

  // Log with enough context for debugging, but don't expose internals
  console.error(`[API Error] ${req.method} ${req.path} → ${status} ${code}:`, err.message);
  if (isDev && err.stack) console.error(err.stack);

  res.status(status).json({
    error: status === 500 && !isDev ? 'Internal server error' : err.message || 'Internal server error',
    code,
    ...(err.details ? { details: err.details } : {}),
  });
}

// Helper to create an error with status
function httpError(message, status = 500, details) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

module.exports = { notFound, errorHandler, httpError };
