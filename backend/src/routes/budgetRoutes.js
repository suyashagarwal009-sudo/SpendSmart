'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { createBudgetController } = require('../controllers/budgetController');

function createBudgetRouter(store) {
  const controller = createBudgetController(store);
  const router = express.Router();

  router.get('/', asyncHandler(controller.getBudget));
  router.put('/', asyncHandler(controller.setBudget));

  return router;
}

module.exports = { createBudgetRouter };
