'use strict';

const env = require('../config/env');
const { HttpError } = require('../utils/errors');

/**
 * Centralized error handling. Every thrown HttpError and every failed
 * async handler funnels through here, so responses always have the shape:
 *
 *   { "success": false, "error": { "message": string, "fields": object } }
 *
 * `fields` is only present for validation errors. Unexpected errors are
 * logged on the server; their internals are only exposed outside
 * production so live debugging stays possible without leaking details
 * to real users.
 */
function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let status = 500;
  let message = 'Something went wrong on the server';
  let fields;

  if (error instanceof HttpError) {
    status = error.status;
    message = error.message;
    fields = error.fields;
  } else if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (error instanceof RangeError && /port/i.test(error.message)) {
    status = 500;
    message = error.message;
  } else if (error) {
    console.error('[spendsmart] unhandled error:', error);
  }

  const payload = {
    success: false,
    error: {
      message,
      ...(fields ? { fields } : {}),
      ...(env.isProduction ? {} : { stack: error && error.stack }),
    },
  };

  res.status(status).json(payload);
}

/**
 * Catch-all for requests that matched no route. Mounted after all real
 * routes so it only sees genuinely unknown paths.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

module.exports = { errorHandler, notFoundHandler };
