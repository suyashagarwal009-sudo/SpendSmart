'use strict';

/**
 * Budget Mongoose model.
 *
 * One document per calendar month for one user. The API exposes a
 * single "budget for the current month", so `month` + `year` identify
 * the record and a unique compound index prevents duplicates.
 */

const mongoose = require('mongoose');
const { MAX_AMOUNT } = require('../config/constants');

const budgetSchema = new mongoose.Schema(
  {
    monthlyBudget: {
      type: Number,
      required: [true, 'Budget amount is required'],
      min: [1, 'Budget must be greater than zero'],
      max: [MAX_AMOUNT, `Budget must be ${MAX_AMOUNT} or less`],
    },
    month: {
      type: Number,
      required: true,
      min: [1, 'Month must be between 1 and 12'],
      max: [12, 'Month must be between 1 and 12'],
    },
    year: {
      type: Number,
      required: true,
      min: [2000, 'Year must be 2000 or later'],
      max: [2100, 'Year must be 2100 or earlier'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  }
);

// Exactly one budget per month/year.
budgetSchema.index({ year: 1, month: 1 }, { unique: true });

/** "YYYY-MM" form used by the API. */
budgetSchema.virtual('monthKey').get(function () {
  return `${this.year}-${String(this.month).padStart(2, '0')}`;
});

module.exports = mongoose.models.Budget || mongoose.model('Budget', budgetSchema);
