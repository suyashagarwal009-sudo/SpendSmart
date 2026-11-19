'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { createRateLimitMiddleware } = require('../middleware/rateLimit');
const { createInsightsController } = require('../controllers/insightsController');

function createInsightsRouter(store, narrator, rateLimitMs = 10000) {
  const controller = createInsightsController(store, narrator);
  const router = express.Router();

  // Every insights call can cost money at the AI provider, so calls are
  // spaced out. Tests pass 0 to disable the limiter. The deterministic
  // fallback still returns full data either way.
  const middlewares = [];
  if (rateLimitMs > 0) {
    middlewares.push(createRateLimitMiddleware({ windowMs: rateLimitMs, message: 'Too many insight requests.' }));
  }
  middlewares.push(asyncHandler(controller.createInsights));
  router.post('/', ...middlewares);

  return router;
}

module.exports = { createInsightsRouter };
