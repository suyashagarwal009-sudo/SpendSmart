'use strict';

/**
 * Translate Mongoose / MongoDB errors into HttpError instances.
 *
 * Stage 0 connection errors are surfaced by the db module. Stage 1:
 * validation (schema + validators), cast (ObjectId), and duplicate-key
 * are the common cases. Anything else becomes a 500.
 */

const mongoose = require('mongoose');
const { HttpError } = require('./errors');

module.exports = {

  /**
   * Duplicate unique index hit or a document-not-found was converted to a
   * duplicate → informs the caller cleanly.
   */
  handleDuplicateKey(err) {
    return new HttpError(
      400,
      'Budget for this month already exists and was updated.'
    );
  },

  /**
   * Schema or validator failed → 400 with per-field messages.
   */
  handleValidation(err) {
    const details = {};
    if (err instanceof mongoose.Error.ValidationError) {
      for (const [field, problem] of Object.entries(err.errors)) {
        details[field] = problem.message;
      }
    }
    return new HttpError(400, 'Invalid document', details);
  },

  /**
   * ObjectId cast failed or a malformed id was supplied → 400.
   */
  handleCast(err) {
    return new HttpError(400, 'Invalid request data');
  },

  /**
   * Anything else → 500.
   */
  handleInternal(err) {
    console.error('[spendsmart] MongoDB error:', err);
    return new HttpError(500, 'Database error');
  },
};
