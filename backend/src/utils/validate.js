'use strict';

const {
  CATEGORIES,
  PAYMENT_METHODS,
  MIN_TITLE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_AMOUNT,
  MAX_AMOUNT_DECIMALS,
  MIN_DATE,
  MAX_DAYS_IN_FUTURE,
} = require('../config/constants');

/**
 * Pure request-validation helpers.
 *
 * Each validator returns the cleaned value when valid, or null when the
 * input is unacceptable. Controllers collect failures into a single
 * 400 response with per-field messages.
 */

function normalizeAmountDecimal(value, decimals) {
  // Round half up, to the given number of decimal places.
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * @returns {{value: string, error: null} | {value: null, error: string}}
 */
function validateDate(value) {
  if (typeof value !== 'string' || value === '') {
    return { value: null, error: 'Date is required' };
  }
  if (!isValidISODate(value)) {
    return { value: null, error: 'Date must be a valid date in YYYY-MM-DD format' };
  }
  if (value < MIN_DATE) {
    return { value: null, error: `Date must be on or after ${MIN_DATE}` };
  }

  const today = new Date();
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(year, month - 1, day);
  const earliest = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const maxDays = MAX_DAYS_IN_FUTURE * 24 * 60 * 60 * 1000;
  if (candidate.getTime() > earliest.getTime() + maxDays) {
    return { value: null, error: 'Date cannot be more than one year in the future' };
  }

  return { value, error: null };
}

/** @returns {{value: number, error: null} | {value: null, error: string}} */
function validateAmount(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { value: null, error: 'Amount is required' };
  }
  if (typeof raw === 'string' && raw.trim() === '') {
    return { value: null, error: 'Amount is required' };
  }
  const amount = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(amount)) {
    return { value: null, error: 'Amount must be a number' };
  }
  if (amount <= 0) {
    return { value: null, error: 'Amount must be greater than zero' };
  }
  if (amount > MAX_AMOUNT) {
    return {
      value: null,
      error: `Amount must be ${MAX_AMOUNT} or less`,
    };
  }
  const rounded = normalizeAmountDecimal(amount, MAX_AMOUNT_DECIMALS);
  return { value: rounded, error: null };
}

/** @returns {{value: string, error: null} | {value: null, error: string}} */
function validateTitle(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { value: null, error: 'Title is required' };
  }
  const title = raw.trim();
  if (title.length < MIN_TITLE_LENGTH) {
    return { value: null, error: `Title must be at least ${MIN_TITLE_LENGTH} characters` };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { value: null, error: `Title must be at most ${MAX_TITLE_LENGTH} characters` };
  }
  return { value: title, error: null };
}

/** @returns {{value: string, error: null} | {value: null, error: string}} */
function validateCategory(raw) {
  if (typeof raw !== 'string' || !CATEGORIES.includes(raw)) {
    return {
      value: null,
      error: `Category must be one of: ${CATEGORIES.join(', ')}`,
    };
  }
  return { value: raw, error: null };
}

/** @returns {{value: string, error: null} | {value: null, error: string}} */
function validatePaymentMethod(raw) {
  if (typeof raw !== 'string' || !PAYMENT_METHODS.includes(raw)) {
    return {
      value: null,
      error: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`,
    };
  }
  return { value: raw, error: null };
}

/**
 * Validate the budget / amount field used by the budget endpoints.
 * Same rules as expense amounts.
 */
function validateBudgetAmount(raw) {
  return validateAmount(raw);
}

module.exports = {
  isValidISODate,
  validateDate,
  validateAmount,
  validateTitle,
  validateCategory,
  validatePaymentMethod,
  validateBudgetAmount,
};
