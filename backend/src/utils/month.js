'use strict';

/**
 * Month-key helpers shared by controllers (the frontend has its own
 * copy in frontend/src/utils/format.js; both use "YYYY-MM" in UTC).
 */

function toISODate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentMonthKey() {
  return toISODate(new Date()).slice(0, 7);
}

module.exports = { currentMonthKey, toISODate };
