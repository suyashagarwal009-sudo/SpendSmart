'use strict';

/**
 * SpendSmart API — MongoDB-backed endpoint tests (Phase 5).
 *
 * Spins up a real MongoDB instance in memory (mongodb-memory-server),
 * connects the Mongoose layer to it, and runs the Express app with the
 * production MongoDB store — no mocks. This proves the Phase 5 code
 * path that `api.test.js` cannot reach, since that suite injects the
 * temporary in-memory store.
 *
 *   cd backend
 *   npm test
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Must be set before `config/env` is first required; dotenv never
// overrides variables already present in process.env.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/spendsmart_test';

const { createApp } = require('../src/app');
const { connectToDatabase, disconnectFromDatabase } = require('../src/config/db');
const Expense = require('../src/models/Expense');
const Budget = require('../src/models/Budget');

let mongo;
let server;
let baseUrl;

function isoDay(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, body: json };
}

const validExpense = () => ({
  title: 'Canteen lunch',
  amount: 120,
  category: 'Food',
  date: isoDay(0),
  paymentMethod: 'UPI',
});

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('spendsmart_test');
  await connectToDatabase(process.env.MONGODB_URI);
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await Expense.deleteMany({});
  await Budget.deleteMany({});
});

after(async () => {
  await disconnectFromDatabase();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongo) await mongo.stop();
});

test('mongo: created expense is persisted and returned with an ObjectId-style id', async () => {
  const created = await api('POST', '/api/expenses', validExpense());
  assert.equal(created.status, 201);
  assert.match(created.body.data.id, /^[a-f\d]{24}$/i);

  const listed = await api('GET', '/api/expenses');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.count, 1);
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].title, 'Canteen lunch');
});

test('mongo: documents survive a fresh store against the same database', async () => {
  const created = await api('POST', '/api/expenses', validExpense());
  const id = created.body.data.id;

  // Simulate a server restart: new app instance, same MongoDB.
  const app2 = createApp();
  const server2 = app2.listen(0);
  await new Promise((resolve) => server2.once('listening', resolve));
  const base2 = `http://127.0.0.1:${server2.address().port}`;
  const response = await fetch(`${base2}/api/expenses/${id}`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.title, 'Canteen lunch');
  await new Promise((resolve) => server2.close(resolve));
});

test('mongo: full CRUD cycle works through the MongoDB store', async () => {
  const created = await api('POST', '/api/expenses', validExpense());
  const id = created.body.data.id;

  const updated = await api('PUT', `/api/expenses/${id}`, {
    title: 'Canteen lunch combo',
    amount: 150,
    category: 'Food',
    date: isoDay(0),
    paymentMethod: 'Card',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.amount, 150);
  assert.equal(updated.body.data.paymentMethod, 'Card');

  const deleted = await api('DELETE', `/api/expenses/${id}`);
  assert.equal(deleted.status, 200);

  const gone = await api('GET', `/api/expenses/${id}`);
  assert.equal(gone.status, 404);
});

test('mongo: malformed ObjectId returns 404, not a 500', async () => {
  const response = await api('GET', '/api/expenses/not-a-valid-id');
  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
});

test('mongo: unknown-but-well-formed ObjectId returns 404', async () => {
  const response = await api('GET', `/api/expenses/${'a'.repeat(24)}`);
  assert.equal(response.status, 404);
});

test('mongo: schema validation failure maps to a 400 with field details', async () => {
  const response = await api('POST', '/api/expenses', {
    title: 'x',
    amount: -5,
    category: 'NotACategory',
    date: '19/11/2026',
    paymentMethod: 'Barter',
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.ok(response.body.error.fields, 'expected per-field error details');
});

test('mongo: budget upsert stores one document per month', async () => {
  const set = await api('PUT', `/api/budget`, { amount: 5000 });
  assert.equal(set.status, 200);
  assert.equal(set.body.data.budget, 5000);

  const again = await api('PUT', `/api/budget`, { amount: 7500 });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.budget, 7500);

  const get = await api('GET', `/api/budget`);
  assert.equal(get.status, 200);
  assert.equal(get.body.data.budget, 7500);

  const docs = await Budget.find({}).exec();
  assert.equal(docs.length, 1, 'upsert must not create duplicate budget documents');
});

test('mongo: health endpoint reports mongo storage mode', async () => {
  const response = await api('GET', '/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.storage, 'mongo');
});
