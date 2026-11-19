'use strict';

/**
 * TEMPORARY in-memory data store (fallback when MONGODB_URI is not set).
 *
 * The production data layer is `mongoStore.js`. This fallback keeps the
 * API runnable for quick local demos without a database. Its interface
 * is async like the MongoDB store so services and controllers are
 * identical for both. All records live in process memory and are lost
 * when the server restarts.
 */

const { newId } = require('../utils/id');

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function clone(record) {
  return record === undefined ? undefined : { ...record };
}

function createStore() {
  /** @type {Map<string, object>} */
  const expenses = new Map();
  /** @type {Map<string, number>} */
  const budgets = new Map();

  return {
    async listExpenses() {
      return [...expenses.values()]
        .map(clone)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    },

    async getExpense(id) {
      const found = expenses.get(id);
      return found ? clone(found) : null;
    },

    async createExpense(data) {
      const now = new Date().toISOString();
      const record = { id: newId(), ...data, createdAt: now, updatedAt: now };
      expenses.set(record.id, record);
      return clone(record);
    },

    async updateExpense(id, data) {
      const existing = expenses.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...data, id: existing.id, updatedAt: new Date().toISOString() };
      expenses.set(id, updated);
      return clone(updated);
    },

    async deleteExpense(id) {
      return expenses.delete(id);
    },

    async getBudget(month) {
      const value = budgets.get(month);
      return typeof value === 'number' ? value : null;
    },

    async setBudget(month, amount) {
      budgets.set(month, amount);
      return amount;
    },

    /** Test helper: wipes all records. */
    reset() {
      expenses.clear();
      budgets.clear();
    },
  };
}

const appStore = createStore();

module.exports = { appStore, createStore, currentMonthKey };
