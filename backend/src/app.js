'use strict';

/**
 * Express application factory.
 *
 * Kept separate from server.js so tests can spin up the app on an
 * ephemeral port without binding the real listener. A fresh store can
 * be injected via options.store; by default the server uses the shared
 * temporary in-memory store.
 */

const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { createApiRouter } = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { dbErrorHandler } = require('./middleware/dbErrorHandler');
const { appStore } = require('./services/store');
const { createMongoStore } = require('./services/mongoStore');
const { createAiNarrator } = require('./services/aiNarrative');

const CORS_OPTIONS = {
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
};

function createApp(options = {}) {
  const app = express();

  app.use(cors(CORS_OPTIONS));
  app.use(express.json({ limit: '100kb' }));

  const narrator =
    options.narrator || createAiNarrator({ apiKey: env.anthropicApiKey, model: env.aiModel });

  if (env.mongoUri) {
    // The server is configured for MongoDB; the MongoDB store is used.
    // Tests can still inject their own store via options.store.
    const store = options.store || createMongoStore();
    const storageMode = options.storageMode || 'mongo';
    app.use('/api', createApiRouter({ store, storageMode, narrator, insightsRateLimitMs: options.insightsRateLimitMs }));
  } else {
    // No MongoDB yet: temporary in-memory, same as Phase 4.
    app.use('/api', createApiRouter({ store: options.store || appStore, narrator, insightsRateLimitMs: options.insightsRateLimitMs }));
  }
  app.use(notFoundHandler);
  app.use(dbErrorHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
