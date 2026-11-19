'use strict';

/**
 * Monthly budget domain operations.
 *
 * A budget belongs to a calendar month ("YYYY-MM"). Each month keeps its
 * own budget, mirroring how the frontend stores budgets.
 */

const { currentMonthKey } = require('./store');

function createBudgetService(store) {
  return {
    async get(month) {
      const budget = await store.getBudget(month);
      return {
        month,
        budget: budget === null ? null : budget,
        // A null budget means "no budget set for this month" rather than
        // "the month does not exist", so this stays 200 by design.
        message: budget === null ? `No budget set for ${month}` : null,
      };
    },

    async set(month, amount) {
      await store.setBudget(month, amount);
      return {
        month,
        budget: amount,
        message: `Budget for ${month} saved`,
      };
    },
  };
}

module.exports = { createBudgetService, currentMonthKey };
