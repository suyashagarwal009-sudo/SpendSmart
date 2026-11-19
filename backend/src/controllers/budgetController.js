'use strict';

/**
 * Budget controller.
 *
 * GET returns the current month's budget (or a null budget when none
 * was saved), PUT validates and stores the current month's budget.
 */

const { HttpError } = require('../utils/errors');
const budgetValidators = require('./validators/budgetValidators');
const { createBudgetService } = require('../services/budgetService');
const { currentMonthKey } = require('../services/store');

function createBudgetController(store) {
  const service = createBudgetService(store);

  return {
    /** GET /api/budget — always the current calendar month. */
    async getBudget(req, res) {
      const month = currentMonthKey();
      const result = await service.get(month);
      res.status(200).json({
        success: true,
        data: { month: result.month, budget: result.budget },
        message: result.message,
      });
    },

    /** PUT /api/budget — sets the current month's budget. */
    async setBudget(req, res) {
      const { errors, value } = budgetValidators.validatePayload(req.body);
      if (Object.keys(errors).length > 0) {
        throw HttpError.badRequest('Invalid budget data', errors);
      }
      const month = currentMonthKey();
      const result = await service.set(month, value.amount);
      res.status(200).json({
        success: true,
        data: { month: result.month, budget: result.budget },
        message: result.message,
      });
    },
  };
}

module.exports = { createBudgetController };
