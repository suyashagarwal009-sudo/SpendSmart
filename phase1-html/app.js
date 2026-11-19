/* ==========================================================================
   SpendSmart — Phase 3 application logic
   Vanilla JavaScript (ES6+). No frameworks, no build step.

   Data model stored under localStorage key "spendsmart.v1":
     {
       version: 1,
       expenses: [{ id, title, amount, category, date, paymentMethod,
                    createdAt, updatedAt }],
       budgets: { "YYYY-MM": number }
     }

   All user-supplied text is rendered with textContent / setAttribute so the
   page never injects markup from stored data.
   ========================================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'spendsmart.v1';
  const DATA_VERSION = 1;

  const CATEGORIES = Object.freeze([
    'Food',
    'Transport',
    'Shopping',
    'Education',
    'Entertainment',
    'Other',
  ]);

  const PAYMENT_METHODS = Object.freeze(['Cash', 'Card', 'UPI', 'Wallet']);

  const MAX_AMOUNT = 10000000; // ₹1,00,00,000 sanity ceiling
  const MAX_TITLE_LENGTH = 80;
  const MIN_TITLE_LENGTH = 2;
  const DUPLICATE_WINDOW_MS = 10000;
  const RAPID_SUBMIT_WINDOW_MS = 400;
  const MESSAGE_TIMEOUT_MS = 4500;

  const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const monthFormatter = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const state = {
    expenses: [],
    budgets: {},
    editingId: null,
    filters: { category: '', from: '', to: '' },
    lastSubmitAt: 0,
  };

  const dom = {};
  const messageTimers = new WeakMap();

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                      */
  /* ------------------------------------------------------------------ */

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function formatCurrency(value) {
    const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    return currencyFormatter.format(safeValue);
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function currentMonthKey() {
    return todayISO().slice(0, 7);
  }

  function monthKeyFromISODate(value) {
    return typeof value === 'string' ? value.slice(0, 7) : '';
  }

  function monthLabel(monthKey) {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return '';
    const [year, month] = monthKey.split('-').map(Number);
    return monthFormatter.format(new Date(year, month - 1, 1));
  }

  function isValidISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const [year, month, day] = value.split('-').map(Number);
    if (year < 2000) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  function maxAllowedDate() {
    const oneYearAhead = new Date();
    oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
    return toISODate(oneYearAhead);
  }

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function sumAmounts(expenses) {
    return roundMoney(expenses.reduce((total, expense) => total + expense.amount, 0));
  }

  /* ------------------------------------------------------------------ */
  /* Messages                                                           */
  /* ------------------------------------------------------------------ */

  function showMessage(element, text, type) {
    if (!element) return;
    element.textContent = text;
    element.className = `form-message ${type}`;
    window.clearTimeout(messageTimers.get(element));
    if (type === 'success') {
      messageTimers.set(
        element,
        window.setTimeout(() => clearMessage(element), MESSAGE_TIMEOUT_MS)
      );
    }
  }

  function clearMessage(element) {
    if (!element) return;
    window.clearTimeout(messageTimers.get(element));
    messageTimers.delete(element);
    element.textContent = '';
    element.className = 'form-message';
  }

  /* ------------------------------------------------------------------ */
  /* Persistence                                                        */
  /* ------------------------------------------------------------------ */

  function loadData() {
    const empty = { expenses: [], budgets: {} };
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.warn('SpendSmart: browser storage is unavailable.', error);
      return empty;
    }
    if (!raw) return empty;

    try {
      return sanitizeState(JSON.parse(raw));
    } catch (error) {
      console.warn('SpendSmart: stored data was invalid and has been ignored.', error);
      return empty;
    }
  }

  function sanitizeState(raw) {
    const result = { expenses: [], budgets: {} };
    if (!raw || typeof raw !== 'object') return result;

    if (Array.isArray(raw.expenses)) {
      const seenIds = new Set();
      raw.expenses.forEach((item) => {
        const expense = sanitizeExpense(item);
        if (!expense) return;
        if (seenIds.has(expense.id)) expense.id = createId();
        seenIds.add(expense.id);
        result.expenses.push(expense);
      });
    }

    if (raw.budgets && typeof raw.budgets === 'object' && !Array.isArray(raw.budgets)) {
      Object.entries(raw.budgets).forEach(([monthKey, value]) => {
        const amount = Number(value);
        if (
          /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) &&
          Number.isFinite(amount) &&
          amount > 0 &&
          amount <= MAX_AMOUNT
        ) {
          result.budgets[monthKey] = roundMoney(amount);
        }
      });
    }

    return result;
  }

  function sanitizeExpense(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const amount = Number(raw.amount);
    const category = CATEGORIES.includes(raw.category) ? raw.category : '';
    const paymentMethod = PAYMENT_METHODS.includes(raw.paymentMethod)
      ? raw.paymentMethod
      : '';
    const date = raw.date;

    if (title.length < MIN_TITLE_LENGTH || title.length > MAX_TITLE_LENGTH) return null;
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
    if (!category || !paymentMethod) return null;
    if (!isValidISODate(date)) return null;

    const now = new Date().toISOString();
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId(),
      title,
      amount: roundMoney(amount),
      category,
      date,
      paymentMethod,
      createdAt: normalizeTimestamp(raw.createdAt, now),
      updatedAt: normalizeTimestamp(raw.updatedAt, now),
    };
  }

  function normalizeTimestamp(value, fallback) {
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
    return fallback;
  }

  function persist() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: DATA_VERSION,
          expenses: state.expenses,
          budgets: state.budgets,
        })
      );
      return true;
    } catch (error) {
      console.warn('SpendSmart: could not save data to browser storage.', error);
      return false;
    }
  }

  const STORAGE_ERROR =
    'Your change is visible now, but it could not be saved to browser storage. ' +
    'Storage may be disabled or full.';

  /* ------------------------------------------------------------------ */
  /* Validation                                                         */
  /* ------------------------------------------------------------------ */

  function validateExpense(input) {
    const errors = {};
    const title = String(input.title ?? '').trim();
    const amountText = String(input.amount ?? '').trim();
    const amount = Number(amountText);
    const category = input.category;
    const date = input.date;
    const paymentMethod = input.paymentMethod;

    if (!title) {
      errors.title = 'Please enter a title for the expense.';
    } else if (title.length < MIN_TITLE_LENGTH) {
      errors.title = `Title must be at least ${MIN_TITLE_LENGTH} characters.`;
    } else if (title.length > MAX_TITLE_LENGTH) {
      errors.title = `Title cannot be longer than ${MAX_TITLE_LENGTH} characters.`;
    }

    if (!amountText || !Number.isFinite(amount)) {
      errors.amount = 'Please enter a valid amount.';
    } else if (amount <= 0) {
      errors.amount = 'Amount must be greater than zero.';
    } else if (amount > MAX_AMOUNT) {
      errors.amount = `Amount must be ${formatCurrency(MAX_AMOUNT)} or less.`;
    }

    if (!CATEGORIES.includes(category)) {
      errors.category = 'Please choose a valid category.';
    }

    if (!isValidISODate(date)) {
      errors.date = 'Please enter a valid date.';
    } else if (date > maxAllowedDate()) {
      errors.date = 'Date cannot be more than one year in the future.';
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      errors.paymentMethod = 'Please choose a payment method.';
    }

    const value = {
      title,
      amount: Number.isFinite(amount) ? roundMoney(amount) : 0,
      category: CATEGORIES.includes(category) ? category : '',
      date: isValidISODate(date) ? date : '',
      paymentMethod: PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : '',
    };

    return { errors, value, isValid: Object.keys(errors).length === 0 };
  }

  function validateBudget(rawValue) {
    const raw = String(rawValue ?? '').trim();
    if (!raw) return { error: 'Please enter a budget amount.', value: null };
    const amount = Number(raw);
    if (!Number.isFinite(amount)) return { error: 'Please enter a valid budget amount.', value: null };
    if (amount <= 0) return { error: 'Budget must be greater than zero.', value: null };
    if (amount > MAX_AMOUNT) {
      return { error: `Budget must be ${formatCurrency(MAX_AMOUNT)} or less.`, value: null };
    }
    return { error: null, value: roundMoney(amount) };
  }

  function fieldElements() {
    return {
      title: dom.expenseTitle,
      amount: dom.expenseAmount,
      category: dom.expenseCategory,
      date: dom.expenseDate,
      paymentMethod: dom.paymentFieldset,
    };
  }

  function applyFieldErrors(errors) {
    const fields = fieldElements();
    Object.entries(fields).forEach(([key, element]) => {
      if (!element) return;
      if (errors[key]) element.setAttribute('aria-invalid', 'true');
      else element.removeAttribute('aria-invalid');
    });
  }

  function clearFieldErrors() {
    applyFieldErrors({});
  }

  function focusFirstInvalid(errors) {
    const order = ['title', 'amount', 'category', 'date', 'paymentMethod'];
    const fields = fieldElements();
    const firstKey = order.find((key) => errors[key]);
    const target = firstKey ? fields[firstKey] : null;
    if (!target) return;
    const focusable = target.matches('fieldset')
      ? target.querySelector('input[type="radio"]')
      : target;
    if (focusable) focusable.focus();
  }

  /* ------------------------------------------------------------------ */
  /* Expense form                                                       */
  /* ------------------------------------------------------------------ */

  function readExpenseForm() {
    const formData = new FormData(dom.expenseForm);
    const payment = formData.get('paymentMethod');
    return {
      title: String(formData.get('title') ?? ''),
      amount: String(formData.get('amount') ?? ''),
      category: String(formData.get('category') ?? ''),
      date: String(formData.get('date') ?? ''),
      paymentMethod: typeof payment === 'string' ? payment : '',
    };
  }

  function resetExpenseForm() {
    dom.expenseForm.reset();
    dom.expenseId.value = '';
    dom.expenseDate.value = todayISO();
    clearFieldErrors();
    dom.expenseSubmit.textContent = 'Add Expense';
    dom.expenseCancel.hidden = true;
  }

  function startEdit(id) {
    const expense = state.expenses.find((item) => item.id === id);
    if (!expense) return;

    state.editingId = id;
    resetExpenseForm();
    clearMessage(dom.expenseMessage);

    dom.expenseId.value = expense.id;
    dom.expenseTitle.value = expense.title;
    dom.expenseAmount.value = String(expense.amount);
    dom.expenseCategory.value = expense.category;
    dom.expenseDate.value = expense.date;
    const paymentInput = dom.expenseForm.querySelector(
      `input[name="paymentMethod"][value="${expense.paymentMethod}"]`
    );
    if (paymentInput) paymentInput.checked = true;

    dom.expenseSubmit.textContent = 'Update Expense';
    dom.expenseCancel.hidden = false;
    showMessage(dom.expenseMessage, `Editing “${expense.title}”.`, 'success');

    document
      .getElementById('add-expense')
      .scrollIntoView({ behavior: 'smooth', block: 'start' });
    dom.expenseTitle.focus({ preventScroll: true });
  }

  function cancelEdit() {
    state.editingId = null;
    resetExpenseForm();
    clearMessage(dom.expenseMessage);
    dom.expenseTitle.focus();
  }

  function findRecentDuplicate(candidate) {
    const now = Date.now();
    return state.expenses.find((expense) => {
      const created = Date.parse(expense.createdAt);
      return (
        Number.isFinite(created) &&
        Math.abs(now - created) < DUPLICATE_WINDOW_MS &&
        expense.title.toLowerCase() === candidate.title.toLowerCase() &&
        expense.amount === candidate.amount &&
        expense.category === candidate.category &&
        expense.date === candidate.date &&
        expense.paymentMethod === candidate.paymentMethod
      );
    });
  }

  function isRapidRepeat() {
    const now = Date.now();
    if (now - state.lastSubmitAt < RAPID_SUBMIT_WINDOW_MS) return true;
    state.lastSubmitAt = now;
    return false;
  }

  function handleExpenseSubmit(event) {
    event.preventDefault();

    // A double click fires two submits: ignore the second one silently,
    // leaving the first submission's message intact.
    if (isRapidRepeat()) return;

    clearMessage(dom.expenseMessage);

    const input = readExpenseForm();
    const { errors, value, isValid } = validateExpense(input);
    applyFieldErrors(errors);

    if (!isValid) {
      const firstMessage =
        errors.title || errors.amount || errors.category || errors.date || errors.paymentMethod;
      showMessage(dom.expenseMessage, firstMessage, 'error');
      focusFirstInvalid(errors);
      return;
    }

    if (state.editingId) {
      updateExpense(value);
    } else {
      addExpense(value);
    }
  }

  function addExpense(value) {
    const duplicate = findRecentDuplicate(value);
    if (duplicate) {
      showMessage(
        dom.expenseMessage,
        `“${value.title}” was just added. Duplicate entry prevented.`,
        'error'
      );
      return;
    }

    const now = new Date().toISOString();
    state.expenses.push({
      id: createId(),
      ...value,
      createdAt: now,
      updatedAt: now,
    });

    const saved = persist();
    resetExpenseForm();
    render();

    if (saved) {
      showMessage(
        dom.expenseMessage,
        `Added “${value.title}” for ${formatCurrency(value.amount)}.`,
        'success'
      );
    } else {
      showMessage(dom.expenseMessage, STORAGE_ERROR, 'error');
    }
  }

  function updateExpense(value) {
    const index = state.expenses.findIndex((item) => item.id === state.editingId);
    if (index === -1) {
      state.editingId = null;
      resetExpenseForm();
      showMessage(dom.expenseMessage, 'That expense no longer exists.', 'error');
      render();
      return;
    }

    const previous = state.expenses[index];
    state.expenses[index] = {
      ...previous,
      ...value,
      updatedAt: new Date().toISOString(),
    };
    state.editingId = null;

    const saved = persist();
    resetExpenseForm();
    render();

    if (saved) {
      showMessage(dom.expenseMessage, `Updated “${value.title}”.`, 'success');
    } else {
      showMessage(dom.expenseMessage, STORAGE_ERROR, 'error');
    }
  }

  function deleteExpense(id) {
    const expense = state.expenses.find((item) => item.id === id);
    if (!expense) return;

    const confirmed = window.confirm(
      `Delete “${expense.title}” (${formatCurrency(expense.amount)})? This cannot be undone.`
    );
    if (!confirmed) return;

    state.expenses = state.expenses.filter((item) => item.id !== id);
    if (state.editingId === id) {
      state.editingId = null;
      resetExpenseForm();
    }

    const saved = persist();
    render();

    showMessage(
      dom.historyMessage,
      saved ? `Deleted “${expense.title}”.` : STORAGE_ERROR,
      saved ? 'success' : 'error'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Budget                                                             */
  /* ------------------------------------------------------------------ */

  function handleBudgetSubmit(event) {
    event.preventDefault();
    clearMessage(dom.budgetMessage);
    dom.budgetInput.removeAttribute('aria-invalid');

    const { error, value } = validateBudget(dom.budgetInput.value);
    if (error) {
      dom.budgetInput.setAttribute('aria-invalid', 'true');
      showMessage(dom.budgetMessage, error, 'error');
      dom.budgetInput.focus();
      return;
    }

    const month = currentMonthKey();
    state.budgets[month] = value;
    const saved = persist();
    render();
    dom.budgetInput.value = String(value);

    if (saved) {
      showMessage(
        dom.budgetMessage,
        `Budget for ${monthLabel(month)} saved: ${formatCurrency(value)}.`,
        'success'
      );
    } else {
      showMessage(dom.budgetMessage, STORAGE_ERROR, 'error');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */

  function render() {
    renderSummary();
    renderTable();
    renderCategoryBreakdown();
  }

  function monthExpenses(monthKey) {
    return state.expenses.filter(
      (expense) => monthKeyFromISODate(expense.date) === monthKey
    );
  }

  function renderSummary() {
    const month = currentMonthKey();
    const label = monthLabel(month);
    const budget = state.budgets[month] ?? 0;
    const spent = sumAmounts(monthExpenses(month));
    const remaining = roundMoney(budget - spent);

    dom.budgetAmount.textContent = formatCurrency(budget);
    dom.budgetAmount.setAttribute(
      'aria-label',
      budget > 0
        ? `Monthly budget for ${label}: ${formatCurrency(budget)}`
        : `No monthly budget set for ${label}`
    );

    dom.spendingAmount.textContent = formatCurrency(spent);
    dom.spendingAmount.setAttribute(
      'aria-label',
      `Total spending for ${label}: ${formatCurrency(spent)}`
    );

    dom.remainingAmount.classList.toggle('is-negative', budget > 0 && remaining < 0);
    if (budget > 0) {
      dom.remainingAmount.textContent = formatCurrency(remaining);
      dom.remainingAmount.setAttribute(
        'aria-label',
        `Remaining balance for ${label}: ${formatCurrency(remaining)}`
      );
    } else {
      dom.remainingAmount.textContent = '—';
      dom.remainingAmount.setAttribute(
        'aria-label',
        'Set a monthly budget to see your remaining balance'
      );
    }

    dom.summaryPeriod.textContent = `Showing ${label}. Amounts are in Indian Rupees (₹).`;
    dom.budgetPeriod.textContent = `Budget month: ${label}.`;

    renderBudgetWarning(budget, spent, label);
  }

  function renderBudgetWarning(budget, spent, label) {
    const warning = dom.budgetWarning;
    warning.classList.remove('error', 'warning', 'note');

    if (budget <= 0) {
      warning.hidden = false;
      warning.classList.add('note');
      warning.textContent = `Set a budget for ${label} to track how much you have left.`;
      return;
    }

    if (spent > budget) {
      warning.hidden = false;
      warning.classList.add('error');
      warning.textContent =
        `Budget exceeded by ${formatCurrency(roundMoney(spent - budget))}. ` +
        `You have spent ${formatCurrency(spent)} of your ${formatCurrency(budget)} budget.`;
      return;
    }

    const usage = spent / budget;
    if (usage >= 0.8) {
      warning.hidden = false;
      warning.classList.add('warning');
      warning.textContent =
        `Heads up — you have used ${Math.round(usage * 100)}% of your budget. ` +
        `${formatCurrency(roundMoney(budget - spent))} left for ${label}.`;
      return;
    }

    warning.hidden = true;
    warning.textContent = '';
  }

  function hasActiveFilters() {
    const { category, from, to } = state.filters;
    return Boolean(category || from || to);
  }

  function matchesFilters(expense) {
    const { category, from, to } = state.filters;
    if (category && expense.category !== category) return false;
    if (from && expense.date < from) return false;
    if (to && expense.date > to) return false;
    return true;
  }

  function sortByNewest(expenses) {
    return [...expenses].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
    });
  }

  function renderTable() {
    const body = dom.tableBody;
    body.replaceChildren();

    const filtered = hasActiveFilters();
    const visible = sortByNewest(state.expenses.filter(matchesFilters));

    dom.historyCaption.textContent = filtered
      ? 'Filtered expenses, newest first.'
      : 'All saved expenses, newest first.';

    if (state.expenses.length === 0) {
      appendEmptyRow(
        body,
        'No expenses yet. Add your first expense using the form above.'
      );
    } else if (visible.length === 0) {
      appendEmptyRow(body, 'No expenses match the current filters.');
    } else {
      const fragment = document.createDocumentFragment();
      visible.forEach((expense) => fragment.append(buildExpenseRow(expense)));
      body.append(fragment);
    }

    renderFilterSummary(visible);
  }

  function appendEmptyRow(body, message) {
    const row = createElement('tr', 'empty-row');
    const cell = createElement('td', '', message);
    cell.colSpan = tableColumnCount();
    row.append(cell);
    body.append(row);
  }

  function tableColumnCount() {
    const table = dom.tableBody.closest('table');
    const headerRow = table && table.tHead ? table.tHead.rows[0] : null;
    return headerRow ? headerRow.cells.length : 6;
  }

  function buildExpenseRow(expense) {
    const row = document.createElement('tr');

    const titleCell = createElement('td', '', expense.title);
    const categoryCell = createElement('td', '', expense.category);
    const dateCell = document.createElement('td');
    const time = createElement('time', '', expense.date);
    time.setAttribute('datetime', expense.date);
    dateCell.append(time);
    const paymentCell = createElement('td', '', expense.paymentMethod);
    const amountCell = createElement('td', '', formatCurrency(expense.amount));

    const actionsCell = createElement('td');
    const actions = createElement('div', 'table-actions');

    const editButton = createElement('button', 'action-button', 'Edit');
    editButton.type = 'button';
    editButton.dataset.action = 'edit';
    editButton.dataset.id = expense.id;
    editButton.setAttribute('aria-label', `Edit ${expense.title}`);

    const deleteButton = createElement('button', 'action-button delete-button', 'Delete');
    deleteButton.type = 'button';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.id = expense.id;
    deleteButton.setAttribute('aria-label', `Delete ${expense.title}`);

    actions.append(editButton, deleteButton);
    actionsCell.append(actions);

    row.append(titleCell, categoryCell, dateCell, paymentCell, amountCell, actionsCell);
    return row;
  }

  function renderFilterSummary(visible) {
    if (!hasActiveFilters()) {
      dom.filterSummary.textContent = '';
      return;
    }
    const total = sumAmounts(visible);
    dom.filterSummary.textContent =
      `Showing ${visible.length} of ${state.expenses.length} expenses, ` +
      `totalling ${formatCurrency(total)}.`;
  }

  function renderCategoryBreakdown() {
    const container = dom.categoryBreakdown;
    container.replaceChildren();

    const month = currentMonthKey();
    const label = monthLabel(month);
    const totals = new Map();

    monthExpenses(month).forEach((expense) => {
      const current = totals.get(expense.category) ?? 0;
      totals.set(expense.category, roundMoney(current + expense.amount));
    });

    if (totals.size === 0) {
      container.hidden = true;
      container.removeAttribute('role');
      container.removeAttribute('aria-label');
      dom.insightsCaption.hidden = true;
      dom.insightsCaption.textContent = '';
      dom.insightsEmpty.hidden = false;
      dom.insightsEmpty.textContent =
        `No expenses recorded for ${label} yet. Add an expense to see the category split.`;
      return;
    }

    const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const total = sumAmounts(entries.map(([, amount]) => ({ amount })));
    const largest = entries[0][1];

    entries.forEach(([category, amount]) => {
      const share = Math.round((amount / total) * 100);
      const row = createElement('div', 'category-row');
      row.setAttribute('role', 'listitem');

      const name = createElement('span', 'category-name', category);
      const track = createElement('div', 'category-track');
      const bar = createElement('div', 'category-bar');
      bar.style.width = `${Math.max(2, (amount / largest) * 100)}%`;
      track.append(bar);

      const value = createElement('span', 'category-value');
      value.append(document.createTextNode(formatCurrency(amount)));
      value.append(createElement('span', 'category-share', ` · ${share}%`));

      row.setAttribute(
        'aria-label',
        `${category}: ${formatCurrency(amount)}, ${share}% of spending`
      );
      row.append(name, track, value);
      container.append(row);
    });

    container.hidden = false;
    container.setAttribute('role', 'list');
    container.setAttribute('aria-label', `Category-wise spending for ${label}`);
    dom.insightsEmpty.hidden = true;
    dom.insightsCaption.hidden = false;
    dom.insightsCaption.textContent =
      `${label} · share of ${formatCurrency(total)} total spending.`;
  }

  /* ------------------------------------------------------------------ */
  /* Filters                                                            */
  /* ------------------------------------------------------------------ */

  function readFilters() {
    state.filters = {
      category: dom.filterCategory.value,
      from: dom.filterFrom.value,
      to: dom.filterTo.value,
    };
    renderTable();
  }

  function clearFilters() {
    dom.filterCategory.value = '';
    dom.filterFrom.value = '';
    dom.filterTo.value = '';
    state.filters = { category: '', from: '', to: '' };
    renderTable();
  }

  /* ------------------------------------------------------------------ */
  /* DOM wiring                                                         */
  /* ------------------------------------------------------------------ */

  function cacheDom() {
    dom.expenseForm = document.getElementById('expense-form');
    dom.expenseId = document.getElementById('expense-id');
    dom.expenseTitle = document.getElementById('expense-title');
    dom.expenseAmount = document.getElementById('expense-amount');
    dom.expenseCategory = document.getElementById('expense-category');
    dom.expenseDate = document.getElementById('expense-date');
    dom.expenseSubmit = document.getElementById('expense-submit');
    dom.expenseCancel = document.getElementById('expense-cancel');
    dom.expenseMessage = document.getElementById('expense-message');
    dom.paymentFieldset = dom.expenseForm.querySelector('fieldset');

    dom.budgetForm = document.getElementById('budget-form');
    dom.budgetInput = document.getElementById('monthly-budget');
    dom.budgetSubmit = document.getElementById('budget-submit');
    dom.budgetMessage = document.getElementById('budget-message');
    dom.budgetWarning = document.getElementById('budget-warning');
    dom.budgetPeriod = document.getElementById('budget-period');

    dom.budgetAmount = document.getElementById('budget-amount');
    dom.spendingAmount = document.getElementById('spending-amount');
    dom.remainingAmount = document.getElementById('remaining-amount');
    dom.summaryPeriod = document.getElementById('summary-period');

    dom.historyMessage = document.getElementById('history-message');
    dom.historyCaption = document.getElementById('history-caption');
    dom.tableBody = document.getElementById('expense-table-body');
    dom.filterCategory = document.getElementById('filter-category');
    dom.filterFrom = document.getElementById('filter-from');
    dom.filterTo = document.getElementById('filter-to');
    dom.clearFilters = document.getElementById('clear-filters');
    dom.filterSummary = document.getElementById('filter-summary');

    dom.categoryBreakdown = document.getElementById('category-breakdown');
    dom.insightsEmpty = document.getElementById('insights-empty');
    dom.insightsCaption = document.getElementById('insights-caption');
  }

  function bindEvents() {
    dom.expenseForm.addEventListener('submit', handleExpenseSubmit);
    dom.expenseCancel.addEventListener('click', cancelEdit);

    dom.expenseForm.addEventListener('input', (event) => {
      const target = event.target;
      if (target && target.getAttribute('aria-invalid') === 'true') {
        target.removeAttribute('aria-invalid');
      }
      if (target && target.name === 'paymentMethod') {
        dom.paymentFieldset.removeAttribute('aria-invalid');
      }
    });

    dom.expenseForm.addEventListener('change', (event) => {
      const target = event.target;
      if (target && target.getAttribute('aria-invalid') === 'true') {
        target.removeAttribute('aria-invalid');
      }
    });

    dom.expenseForm.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.editingId) {
        event.preventDefault();
        cancelEdit();
      }
    });

    dom.tableBody.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      if (button.dataset.action === 'edit') startEdit(button.dataset.id);
      if (button.dataset.action === 'delete') deleteExpense(button.dataset.id);
    });

    dom.budgetForm.addEventListener('submit', handleBudgetSubmit);
    dom.budgetInput.addEventListener('input', () => {
      dom.budgetInput.removeAttribute('aria-invalid');
    });

    dom.filterCategory.addEventListener('change', readFilters);
    dom.filterFrom.addEventListener('change', readFilters);
    dom.filterTo.addEventListener('change', readFilters);
    dom.clearFilters.addEventListener('click', clearFilters);
  }

  function init() {
    cacheDom();
    const stored = loadData();
    state.expenses = stored.expenses;
    state.budgets = stored.budgets;

    if (!dom.expenseDate.value) dom.expenseDate.value = todayISO();

    const budget = state.budgets[currentMonthKey()] ?? 0;
    if (budget > 0) dom.budgetInput.value = String(budget);

    bindEvents();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
