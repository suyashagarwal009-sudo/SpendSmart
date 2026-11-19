'use strict';

/**
 * Expense controller.
 *
 * Parses and validates input, delegates to the expense service, and
 * shapes the JSON response. No direct data-store access happens here.
 * All service calls are awaited; asyncHandler forwards rejections to the
 * centralized error middleware.
 */

const { HttpError } = require('../utils/errors');
const expenseValidators = require('./validators/expenseValidators');
const { createExpenseService } = require('../services/expenseService');

function createExpenseController(store) {
  const service = createExpenseService(store);

  return {
    /** GET /api/expenses */
    async listExpenses(req, res) {
      const expenses = await service.list();
      res.status(200).json({
        success: true,
        data: expenses,
        count: expenses.length,
      });
    },

    /** GET /api/expenses/:id */
    async getExpense(req, res) {
      const { id } = req.params;
      if (!expenseValidators.isValidId(id)) {
        throw HttpError.badRequest(`Invalid expense id "${id}"`);
      }
      const expense = await service.getById(id);
      res.status(200).json({ success: true, data: expense });
    },

    /** POST /api/expenses */
    async createExpense(req, res) {
      const { errors, value } = expenseValidators.validateCreatePayload(req.body);
      if (Object.keys(errors).length > 0) {
        throw HttpError.badRequest('Invalid expense data', errors);
      }
      const expense = await service.create(value);
      res.status(201).json({ success: true, data: expense });
    },

    /** PUT /api/expenses/:id — full replacement of the editable fields. */
    async updateExpense(req, res) {
      const { id } = req.params;
      if (!expenseValidators.isValidId(id)) {
        throw HttpError.badRequest(`Invalid expense id "${id}"`);
      }
      const { errors, value } = expenseValidators.validateCreatePayload(req.body);
      if (Object.keys(errors).length > 0) {
        throw HttpError.badRequest('Invalid expense data', errors);
      }
      const expense = await service.update(id, value);
      res.status(200).json({ success: true, data: expense });
    },

    /** PATCH /api/expenses/:id — partial update. */
    async patchExpense(req, res) {
      const { id } = req.params;
      if (!expenseValidators.isValidId(id)) {
        throw HttpError.badRequest(`Invalid expense id "${id}"`);
      }
      const { errors, value } = expenseValidators.validateUpdatePayload(req.body);
      if (Object.keys(errors).length > 0) {
        throw HttpError.badRequest('Invalid expense data', errors);
      }
      const expense = await service.update(id, value);
      res.status(200).json({ success: true, data: expense });
    },

    /** DELETE /api/expenses/:id */
    async deleteExpense(req, res) {
      const { id } = req.params;
      if (!expenseValidators.isValidId(id)) {
        throw HttpError.badRequest(`Invalid expense id "${id}"`);
      }
      await service.remove(id);
      res.status(200).json({ success: true, data: null, message: `Expense "${id}" deleted` });
    },
  };
}

module.exports = { createExpenseController };
