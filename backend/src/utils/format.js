'use strict';

/**
 * Shared numeric formatting helpers for backend calculations.
 */

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

module.exports = { roundMoney };
