'use strict';

/**
 * Expense domain operations.
 *
 * Thin async layer over the data store: the store handles persistence,
 * the service handles the 404 lookups. Controllers stay focused on
 * translating between HTTP and this API.
 */

const { HttpError } = require('../utils/errors');

function createExpenseService(store) {
  return {
    list() {
      return store.listExpenses();
    },

    async getById(id) {
      const expense = await store.getExpense(id);
      if (!expense) {
        throw HttpError.notFound(`Expense "${id}" not found`);
      }
      return expense;
    },

    create(data) {
      return store.createExpense(data);
    },

    async update(id, data) {
      const updated = await store.updateExpense(id, data);
      if (!updated) {
        throw HttpError.notFound(`Expense "${id}" not found`);
      }
      return updated;
    },

    async remove(id) {
      const existed = await store.deleteExpense(id);
      if (!existed) {
        throw HttpError.notFound(`Expense "${id}" not found`);
      }
      return true;
    },
  };
}

module.exports = { createExpenseService };
