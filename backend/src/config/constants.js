'use strict';

/**
 * Shared business rules for the SpendSmart API.
 *
 * These mirror the validation rules the Phase 3 frontend already uses,
 * so values the browser accepts are exactly the values the API accepts.
 */

const CATEGORIES = Object.freeze([
  'Food',
  'Transport',
  'Shopping',
  'Education',
  'Entertainment',
  'Other',
]);

const PAYMENT_METHODS = Object.freeze(['Cash', 'Card', 'UPI', 'Wallet']);

const MIN_TITLE_LENGTH = 2;
const MAX_TITLE_LENGTH = 80;

const MAX_AMOUNT = 10000000; // ₹1,00,00,000 sanity ceiling
const MAX_AMOUNT_DECIMALS = 2;

const MIN_DATE = '2000-01-01';

/** Maximum number of days an expense date may lie in the future. */
const MAX_DAYS_IN_FUTURE = 366;

module.exports = {
  CATEGORIES,
  PAYMENT_METHODS,
  MIN_TITLE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_AMOUNT,
  MAX_AMOUNT_DECIMALS,
  MIN_DATE,
  MAX_DAYS_IN_FUTURE,
};
