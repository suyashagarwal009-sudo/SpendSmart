'use strict';

/**
 * Minimal in-memory rate limiter (no external dependency).
 *
 * Used on POST /api/insights because every call can cost money at the
 * AI provider. One successful window per key (IP + route) — good
 * enough for a single-user demo deployment, not a production
 * solution (a real one would use a shared store and per-user keys).
 */

function createRateLimitMiddleware({ windowMs, message }) {
  const lastCallByKey = new Map();

  return function rateLimit(req, res, next) {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const last = lastCallByKey.get(key) || 0;

    if (now - last < windowMs) {
      const waitSeconds = Math.ceil((windowMs - (now - last)) / 1000);
      return res.status(429).json({
        success: false,
        error: {
          message: `${message} Try again in ${waitSeconds}s.`,
        },
      });
    }

    lastCallByKey.set(key, now);
    next();
  };
}

module.exports = { createRateLimitMiddleware };
