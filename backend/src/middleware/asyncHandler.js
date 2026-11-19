'use strict';

/**
 * Wraps async route handlers so rejections reach the centralized error
 * middleware instead of crashing the process (Express 4 does not catch
 * async handler rejections on its own).
 *
 * @param {(req, res, next) => Promise<any>} handler
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
