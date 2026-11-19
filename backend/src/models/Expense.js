'use strict';

/**
 * Expense Mongoose model.
 *
 * Schema-level rules mirror the API-level validators in
 * `utils/validate.js` and the frontend's Phase 3 rules, so a document
 * can never be stored that the API would have rejected.
 *
 * `runValidators` / `$set` note: validators run on create and on
 * updateOne with `runValidators: true`; see `mongoStore.js`.
 */

const mongoose = require('mongoose');
const {
  CATEGORIES,
  PAYMENT_METHODS,
  MIN_TITLE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_AMOUNT,
} = require('../config/constants');

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [MIN_TITLE_LENGTH, `Title must be at least ${MIN_TITLE_LENGTH} characters`],
      maxlength: [MAX_TITLE_LENGTH, `Title must be at most ${MAX_TITLE_LENGTH} characters`],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
      max: [MAX_AMOUNT, `Amount must be ${MAX_AMOUNT} or less`],
      validate: {
        validator(value) {
          return Number.isFinite(value) && Math.round(value * 100) === Number((value * 100).toFixed(0));
        },
        message: 'Amount may have at most 2 decimal places',
      },
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: CATEGORIES,
        message: `Category must be one of: ${CATEGORIES.join(', ')}`,
      },
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be a valid date in YYYY-MM-DD format'],
      index: true,
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: PAYMENT_METHODS,
        message: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`,
      },
    },
  },
  {
    timestamps: true, // createdAt / updatedAt
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        // Expose `id` and hide Mongo's internal `_id` so the API shape
        // stays identical to the Phase 4 in-memory version.
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  }
);

// Newest expenses first, then most recently created as a tiebreak.
expenseSchema.index({ date: -1, createdAt: -1 });

module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
