'use strict';

/**
 * Centralised environment configuration.
 *
 * Every process reads its settings from here, never from
 * `process.env` directly, so defaults and validation live in one place.
 */

const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '..', '.env'),
});

const DEFAULT_PORT = 5000;

// VS Code Live Server (5500) and common dev servers (3000).
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function parsePort(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${value}" - expected an integer between 1 and 65535`);
  }
  return port;
}

function parseCorsOrigins(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) return fallback;
  for (const origin of origins) {
    try {
      new URL(origin);
    } catch (error) {
      throw new Error(`Invalid CORS origin "${origin}" in CORS_ORIGINS`);
    }
  }
  return origins;
}

const nodeEnv = process.env.NODE_ENV || 'development';

const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: parsePort(process.env.PORT, DEFAULT_PORT),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS, DEFAULT_CORS_ORIGINS),
  // MongoDB connection string (Phase 5). When unset the API falls back
  // to temporary in-memory storage.
  mongoUri: process.env.MONGODB_URI || null,
};

module.exports = env;
