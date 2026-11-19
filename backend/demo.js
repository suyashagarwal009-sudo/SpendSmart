'use strict';

/**
 * SpendSmart API — interactive demo.
 *
 * Starts the backend on a free port and walks through the full API
 * surface, printing each request and response. Useful for a faculty
 * demonstration or a quick smoke check.
 *
 *   cd backend
 *   node demo.js
 */

const http = require('node:http');
const { createApp } = require('./src/app');
const { createStore } = require('./src/services/store');

const today = new Date();
const isoDay = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

function line(label, value) {
  console.log(`  ${label}: ${value}`);
}

async function call(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  console.log(`\n${method} ${path}`);
  line('status', response.status);
  line('body', JSON.stringify(json));
  return json;
}

let baseUrl;

async function main() {
  const store = createStore();
  const app = createApp({ store, storageMode: 'temporary-in-memory' });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  console.log('SpendSmart API demo\n===================');
  console.log(`Listening on ${baseUrl} (temporary in-memory storage)\n`);

  await call('GET', '/api/health');
  await call('GET', '/api/expenses');

  const first = await call('POST', '/api/expenses', {
    title: 'Canteen lunch',
    amount: 120,
    category: 'Food',
    date: isoDay(-1),
    paymentMethod: 'UPI',
  });
  const second = await call('POST', '/api/expenses', {
    title: 'Metro card top-up',
    amount: 250.75,
    category: 'Transport',
    date: isoDay(0),
    paymentMethod: 'Card',
  });
  await call('GET', '/api/expenses');
  await call('GET', `/api/expenses/${first.data.id}`);
  await call('PUT', `/api/expenses/${first.data.id}`, {
    title: 'Canteen dinner',
    amount: 180,
    category: 'Food',
    date: isoDay(-1),
    paymentMethod: 'Card',
  });
  await call('PATCH', `/api/expenses/${second.data.id}`, { amount: 300 });
  await call('DELETE', `/api/expenses/${second.data.id}`);
  await call('GET', `/api/expenses/${second.data.id}`);
  await call('POST', '/api/expenses', {
    title: '',
    amount: -5,
    category: 'Crypto',
    date: '2026-13-40',
    paymentMethod: 'Bitcoin',
  });

  await call('GET', '/api/budget');
  await call('PUT', '/api/budget', { amount: 5000 });
  await call('GET', '/api/budget');
  await call('PUT', '/api/budget', { amount: 0 });
  await call('GET', '/api/does-not-exist');

  console.log('\nDemo complete. Summary of the current month:');
  console.log(`  month: ${monthKey}`);
  const expenses = await (await fetch(`${baseUrl}/api/expenses`)).json();
  console.log(`  expenses stored: ${expenses.count}`);
  console.log('  (storage is temporary: restart the server and the data is gone)\n');

  server.close();
}

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exitCode = 1;
});
