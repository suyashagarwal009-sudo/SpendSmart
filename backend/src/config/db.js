'use strict';

/**
 * MongoDB connection module.
 *
 * Single place that opens (and closes) the Mongoose connection. The
 * server awaits `connectToDatabase()` before listening, so a broken
 * URI or unreachable cluster fails fast with a clear message instead of
 * accepting requests that can never succeed.
 */

const mongoose = require('mongoose');

// Fail a query quickly instead of hanging for the default 10s.
mongoose.set('strictQuery', true);

let connected = false;

/**
 * @param {string} uri MongoDB connection string
 * @returns {Promise<typeof mongoose>}
 */
async function connectToDatabase(uri) {
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Copy backend/.env.example to backend/.env and provide a connection string.'
    );
  }

  mongoose.connection.on('disconnected', () => {
    connected = false;
    console.warn('[spendsmart] MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    connected = true;
    console.info('[spendsmart] MongoDB reconnected');
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
  });

  connected = true;
  const { host, port, name } = mongoose.connection;
  console.log(`MongoDB connected: ${host}:${port}/${name}`);
  return mongoose;
}

async function disconnectFromDatabase() {
  if (connected) {
    await mongoose.disconnect();
    connected = false;
  }
}

function isConnected() {
  return connected && mongoose.connection.readyState === 1;
}

module.exports = { connectToDatabase, disconnectFromDatabase, isConnected };
