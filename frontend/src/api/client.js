/**
 * SpendSmart API client — the single place the frontend talks to the
 * Express backend.
 *
 * The backend URL comes from the VITE_API_URL environment variable
 * (see .env.example). Vite only exposes variables prefixed with VITE_,
 * and this project has no secrets in them: everything here ships to the
 * browser, so private keys must never live in frontend env files.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields || null;
  }
}

async function request(path, options = {}) {
  const { method = 'GET', body } = options;

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      'Cannot reach the server. Make sure the backend is running, then try again.',
      0
    );
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && payload.error && (payload.error.message || payload.error)) ||
      `Request failed with status ${response.status}`;
    const fields = payload && payload.error && payload.error.fields;
    throw new ApiError(message, response.status, fields);
  }

  return payload && payload.data !== undefined ? payload.data : payload;
}

export function getExpenses() {
  return request('/api/expenses');
}

export function createExpense(expense) {
  return request('/api/expenses', { method: 'POST', body: expense });
}

export function updateExpense(id, expense) {
  return request(`/api/expenses/${id}`, { method: 'PUT', body: expense });
}

export function deleteExpense(id) {
  return request(`/api/expenses/${id}`, { method: 'DELETE' });
}

export function getBudget() {
  return request('/api/budget');
}

export function setBudget(amount) {
  return request('/api/budget', { method: 'PUT', body: { amount } });
}

export function getHealth() {
  return request('/api/health');
}
