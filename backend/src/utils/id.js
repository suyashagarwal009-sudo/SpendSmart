'use strict';

/**
 * ID generation.
 *
 * Uses `crypto.randomUUID()` (Node >= 14.17) with a fallback for very
 * old runtimes. Stored IDs are opaque strings, which keeps the API
 * compatible with both the current in-memory store and the future
 * MongoDB layer.
 */

const crypto = require('crypto');

function newId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Rough shape check used to reject nonsense IDs before looking them up. */
function looksLikeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(id);
}

module.exports = { newId, looksLikeId };
