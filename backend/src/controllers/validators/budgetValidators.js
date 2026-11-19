'use strict';

/**
 * Request-body validator for the budget endpoints.
 *
 * Accepts `{ amount }` or `{ budget }` as the key, since both names read
 * naturally; one of them must be present and pass the amount rules.
 */

const { validateBudgetAmount } = require('../../utils/validate');

function validatePayload(body) {
  const errors = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'Request body must be a JSON object' }, value: {} };
  }

  const raw =
    body.amount !== undefined ? body.amount :
    body.budget !== undefined ? body.budget :
    undefined;

  const { value, error } = validateBudgetAmount(raw);
  if (error) {
    errors.amount = error;
    return { errors, value: {} };
  }

  return { errors, value: { amount: value } };
}

module.exports = { validatePayload };
