'use strict';

const express = require('express');
const { createExpenseRouter } = require('./expenseRoutes');
const { createBudgetRouter } = require('./budgetRoutes');

/**
 * Mounts the API surface under /api:
 *
 *   GET    /api/health          service status
 *   GET    /api/expenses        list all expenses
 *   POST   /api/expenses        create an expense
 *   GET    /api/expenses/:id    fetch one expense
 *   PUT    /api/expenses/:id    replace all editable fields
 *   PATCH  /api/expenses/:id    update a subset of fields
 *   DELETE /api/expenses/:id    delete an expense
 *   GET    /api/budget          current month's budget
 *   PUT    /api/budget          set current month's budget
 */
function createApiRouter({ store, storageMode }) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        service: 'spendsmart-backend',
        storage: storageMode,
        timestamp: new Date().toISOString(),
      },
    });
  });

  router.use('/expenses', createExpenseRouter(store));
  router.use('/budget', createBudgetRouter(store));

  return router;
}

module.exports = { createApiRouter };
