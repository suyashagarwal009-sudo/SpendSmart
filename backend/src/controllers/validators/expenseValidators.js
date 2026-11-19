'use strict';

/**
 * Request-body validators for the expense endpoints.
 *
 * `validateCreatePayload` checks all fields (used by both POST and the
 * full PUT). `validateUpdatePayload` checks only the fields a PATCH
 * supplies. Each returns `{ errors, value }` where errors maps field
 * names to messages and value holds the cleaned, storage-ready data.
 */

const {
  validateTitle,
  validateAmount,
  validateCategory,
  validatePaymentMethod,
  validateDate,
} = require('../../utils/validate');
const { looksLikeId } = require('../../utils/id');

function isValidId(id) {
  return looksLikeId(id);
}

function collectFieldErrors(body, fields) {
  const errors = {};
  const value = {};
  Object.entries(fields).forEach(([key, validator]) => {
    const { value: cleaned, error } = validator(body ? body[key] : undefined);
    if (error) errors[key] = error;
    else value[key] = cleaned;
  });
  return { errors, value };
}

/** Requires every editable field to be present and valid. */
function validateCreatePayload(body) {
  const { errors, value } = collectFieldErrors(body, {
    title: validateTitle,
    amount: validateAmount,
    category: validateCategory,
    date: validateDate,
    paymentMethod: validatePaymentMethod,
  });
  return { errors, value };
}

/** Checks only supplied fields; at least one is required. */
function validateUpdatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'Request body must be a JSON object' }, value: {} };
  }

  const fields = [
    ['title', validateTitle],
    ['amount', validateAmount],
    ['category', validateCategory],
    ['date', validateDate],
    ['paymentMethod', validatePaymentMethod],
  ];

  const errors = {};
  const value = {};
  let supplied = 0;

  fields.forEach(([key, validator]) => {
    if (body[key] === undefined) return;
    supplied += 1;
    const { value: cleaned, error } = validator(body[key]);
    if (error) errors[key] = error;
    else value[key] = cleaned;
  });

  if (supplied === 0) {
    errors.body = 'Provide at least one editable field: title, amount, category, date, paymentMethod';
  }

  return { errors, value };
}

module.exports = {
  isValidId,
  validateCreatePayload,
  validateUpdatePayload,
};
