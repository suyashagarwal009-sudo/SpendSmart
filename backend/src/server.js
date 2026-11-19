'use strict';

/**
 * SpendSmart backend — Phase 5 entry point.
 *
 * Connects to MongoDB first, then starts the HTTP listener. On failure to
 * connect, the process exits instead of accepting requests that cannot
 * reach the database. Temporary in-memory storage is no longer used once
 * MONGODB_URI is set.
 *
 * Start with:
 *   cd backend
 *   npm install
 *   copy .env.example .env   (or write your own .env)
 *   npm start
 */

const env = require('./config/env');
const { createApp } = require('./app');
const { connectToDatabase, disconnectFromDatabase } = require('./config/db');

async function main() {
  try {
    if (env.mongoUri) {
      await connectToDatabase(env.mongoUri);
    }

    const app = createApp();
    const server = app.listen(env.port, () => {
      console.log(`SpendSmart API listening on http://localhost:${env.port}`);
      console.log(`Environment: ${env.nodeEnv}`);
      console.log(`Storage: ${env.mongoUri ? 'MongoDB' : 'temporary in-memory'}`);
      console.log(`CORS origins: ${env.corsOrigins.join(', ')}`);
      if (env.mongoUri) {
        console.log(`MongoDB: ${env.mongoUri.includes('mongodb+srv') ? 'Atlas' : 'local or remote'}`);
      }
    });

    /**
     * Graceful shutdown: stop accepting new requests, then close the
     * database connection so in-flight queries can finish.
     */
    function shutdown(signal) {
      console.log(`\n${signal} received: shutting down the SpendSmart API`);
      server.close(async () => {
        try {
          if (env.mongoUri) await disconnectFromDatabase();
        } catch (err) {
          console.error('Error during disconnect:', err.message);
        }
        process.exit(0);
      });
      // Force-exit if connections refuse to drain.
      setTimeout(() => process.exit(1), 5000).unref();
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      shutdown('unhandledRejection');
    });
  } catch (err) {
    console.error('Failed to start the API:', err.message);
    process.exit(1);
  }
}

main();
