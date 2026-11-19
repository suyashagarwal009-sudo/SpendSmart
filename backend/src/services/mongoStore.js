'use strict';

/**
 * MongoDB-backed data store (Phase 5).
 *
 * Implements the same async interface as `store.js`, so services and
 * controllers are identical for both. Records persist across server
 * restarts because they live in MongoDB.
 *
 * MONGODB_URI examples:
 *   mongodb://127.0.0.1:27017/spendsmart_db
 *   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/spendsmart_db?retryWrites=true&w=majority
 */

const { isValidObjectId } = require('mongoose');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');

function toPublicExpense(doc) {
  const plain = doc.toObject ? doc.toObject() : { ...doc };
  plain.id = String(plain._id);
  delete plain._id;
  return plain;
}

function isValidId(id) {
  return typeof id === 'string' && isValidObjectId(id);
}

function splitMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return { year, month: monthNumber };
}

function createMongoStore() {
  return {
    async listExpenses() {
      const docs = await Expense.find().sort({ date: -1, createdAt: -1 }).exec();
      return docs.map(toPublicExpense);
    },

    async getExpense(id) {
      if (!isValidId(id)) return null;
      const doc = await Expense.findById(id).exec();
      return doc ? toPublicExpense(doc) : null;
    },

    async createExpense(data) {
      const doc = await Expense.create(data);
      return toPublicExpense(doc);
    },

    async updateExpense(id, data) {
      if (!isValidId(id)) return null;
      const doc = await Expense.findByIdAndUpdate(
        id,
        { $set: data },
        { new: true, runValidators: true }
      ).exec();
      return doc ? toPublicExpense(doc) : null;
    },

    async deleteExpense(id) {
      if (!isValidId(id)) return false;
      const result = await Expense.deleteOne({ _id: id }).exec();
      return result.deletedCount === 1;
    },

    async getBudget(month) {
      const { year, month: monthNumber } = splitMonth(month);
      const doc = await Budget.findOne({ year, month: monthNumber }).exec();
      return doc ? doc.monthlyBudget : null;
    },

    async setBudget(month, amount) {
      const { year, month: monthNumber } = splitMonth(month);
      const doc = await Budget.findOneAndUpdate(
        { year, month: monthNumber },
        { $set: { monthlyBudget: amount, year, month: monthNumber } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).exec();
      return doc.monthlyBudget;
    },
  };
}

module.exports = { createMongoStore, isValidId };
