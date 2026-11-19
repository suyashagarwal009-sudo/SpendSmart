'use strict';

/**
 * Translates Mongoose / MongoDB errors raised by route handlers into the
 * project's HttpError shape, so the centralized error middleware can
 * produce the usual JSON envelope.
 *
 * Runs after routes but before errorHandler.
 */

const mongoose = require('mongoose');
const mongoErrors = require('../utils/mongoErrors');
const { HttpError } = require('../utils/errors');

function dbErrorHandler(err, req, res, next) {
  // Already an HttpError (validation in our own layer): pass through.
  if (err instanceof HttpError) return next(err);

  if (err && err.name === 'CastError') {
    return next(mongoErrors.handleCast(err));
  }

  if (err && (err.name === 'ValidationError' || err instanceof mongoose.Error.ValidationError)) {
    return next(mongoErrors.handleValidation(err));
  }

  if (err && err.code === 11000) {
    return next(mongoErrors.handleDuplicateKey(err));
  }

  // Mongoose network / timeout errors surface as MongoServerError or
  // MongooseServerSelectionError. Report a 503 so clients can retry.
  if (err && (err.name === 'MongooseServerSelectionError' || err.name === 'MongoServerError')) {
    console.error('[spendsmart] MongoDB connection error:', err.message);
    return next(new HttpError(503, 'Database unavailable. Please try again shortly.'));
  }

  return next(err);
}

module.exports = { dbErrorHandler };
