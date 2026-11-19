'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { createExpenseController } = require('../controllers/expenseController');

function createExpenseRouter(store) {
  const controller = createExpenseController(store);
  const router = express.Router();

  router.get('/', asyncHandler(controller.listExpenses));
  router.post('/', asyncHandler(controller.createExpense));
  router.get('/:id', asyncHandler(controller.getExpense));
  router.put('/:id', asyncHandler(controller.updateExpense));
  router.patch('/:id', asyncHandler(controller.patchExpense));
  router.delete('/:id', asyncHandler(controller.deleteExpense));

  return router;
}

module.exports = { createExpenseRouter };
