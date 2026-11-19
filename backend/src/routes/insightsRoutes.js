'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { createInsightsController } = require('../controllers/insightsController');

function createInsightsRouter(store, narrator) {
  const controller = createInsightsController(store, narrator);
  const router = express.Router();

  router.post('/', asyncHandler(controller.createInsights));

  return router;
}

module.exports = { createInsightsRouter };
