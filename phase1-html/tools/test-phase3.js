/* ==========================================================================
   SpendSmart — Phase 3 functional tests
   Drives the real page in Chromium with Playwright and asserts on the DOM
   and on localStorage. Each test runs in a fresh browser context, so stored
   data never leaks between tests.

   Run from this directory:
     node test-phase3.js
   ========================================================================== */

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const PAGE_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

/* --------------------------------------------------------------------------
   Shared date fixtures (always the current month, so summary cards apply)
   -------------------------------------------------------------------------- */
const now = new Date();
const MONTH_KEY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
}).format(now);
const TODAY = (() => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
})();
const day = (n) => `${MONTH_KEY}-${String(n).padStart(2, '0')}`;
const DATE_01 = day(1);
const DATE_05 = day(5);
const DATE_10 = day(10);
const DATE_15 = day(15);
const DATE_20 = day(20);
const NEXT_MONTH_KEY = (() => {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
})();

/* --------------------------------------------------------------------------
   Assertions
   -------------------------------------------------------------------------- */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(haystack, needle, label) {
  if (!String(haystack).includes(needle)) {
    throw new Error(`${label}: expected to include ${JSON.stringify(needle)}, got ${JSON.stringify(haystack)}`);
  }
}

/* --------------------------------------------------------------------------
   Page helpers
   -------------------------------------------------------------------------- */
async function text(page, selector) {
  return (await page.textContent(selector) || '').trim();
}

function dataRows(page) {
  return page.locator('#expense-table-body tr:not(.empty-row)');
}

async function dataRowCount(page) {
  return dataRows(page).count();
}

async function rowByTitle(page, title) {
  return page.locator('#expense-table-body tr:not(.empty-row)', { hasText: title }).first();
}

async function submitExpense(page) {
  // Stay clear of the 400 ms double-submit guard between intentional submits.
  await page.waitForTimeout(450);
  await page.click('#expense-submit');
}

async function fillExpense(page, fields) {
  const {
    title,
    amount,
    category,
    date,
    payment = 'Cash',
    submit = true,
  } = fields;

  if (title !== undefined) await page.fill('#expense-title', String(title));
  if (amount !== undefined) await page.fill('#expense-amount', String(amount));
  if (category !== undefined) await page.selectOption('#expense-category', category);
  if (date !== undefined) await page.fill('#expense-date', date);
  if (payment) await page.check(`input[name="paymentMethod"][value="${payment}"]`);

  if (submit) await submitExpense(page);
}

async function setFilter(page, selector, value) {
  await page.evaluate(
    ({ selector: sel, value: val }) => {
      const element = document.querySelector(sel);
      element.value = val;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { selector, value }
  );
}

async function storedState(page) {
  const raw = await page.evaluate(() => localStorage.getItem('spendsmart.v1'));
  return raw ? JSON.parse(raw) : null;
}

/* --------------------------------------------------------------------------
   Runner
   -------------------------------------------------------------------------- */
const results = [];
let browser;

async function test(name, fn) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];

  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });

  await page.goto(PAGE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  try {
    await fn(page);
    if (pageErrors.length) throw new Error(`Unexpected page errors: ${pageErrors.join(' | ')}`);
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`FAIL  ${name}\n      ${error.message}`);
  } finally {
    await context.close();
  }
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */
async function run() {
  console.log(`\nSpendSmart Phase 3 — functional tests`);
  console.log(`Month under test: ${MONTH_LABEL} (${MONTH_KEY})\n`);

  browser = await chromium.launch();

  await test('1. Empty state on first load', async (page) => {
    assertEqual(await dataRowCount(page), 0, 'data rows');
    assertIncludes(await text(page, '#expense-table-body'), 'No expenses yet', 'empty table message');
    assertEqual(await text(page, '#budget-amount'), '₹0', 'budget card');
    assertEqual(await text(page, '#spending-amount'), '₹0', 'spending card');
    assertEqual(await text(page, '#remaining-amount'), '—', 'remaining card');
    assertEqual(
      await text(page, '#budget-warning'),
      `Set a budget for ${MONTH_LABEL} to track how much you have left.`,
      'budget note'
    );
    assertIncludes(await text(page, '#insights-empty'), 'No expenses recorded', 'insights empty state');
    assertEqual(await text(page, '#filter-summary'), '', 'filter summary');
    assertEqual(await page.inputValue('#monthly-budget'), '', 'budget input');
    assertEqual(await page.inputValue('#expense-date'), TODAY, 'date defaults to today');
  });

  await test('2. Add expense updates table, cards and insights', async (page) => {
    await fillExpense(page, {
      title: 'Canteen lunch',
      amount: 120,
      category: 'Food',
      date: DATE_05,
      payment: 'UPI',
    });

    assertEqual(await dataRowCount(page), 1, 'data rows');
    const row = await (await rowByTitle(page, 'Canteen lunch')).textContent();
    ['Canteen lunch', 'Food', DATE_05, 'UPI', '₹120'].forEach((part) =>
      assertIncludes(row, part, 'row contents')
    );
    assertEqual(await text(page, '#spending-amount'), '₹120', 'spending card');
    assertEqual(await text(page, '#remaining-amount'), '—', 'remaining without budget');
    assertIncludes(await text(page, '#expense-message'), 'Added', 'success message');

    assertEqual(await page.locator('#category-breakdown .category-row').count(), 1, 'breakdown rows');
    assertIncludes(await text(page, '#category-breakdown'), 'Food', 'breakdown category');
    assertIncludes(await text(page, '#category-breakdown'), '₹120', 'breakdown amount');
    assertEqual(await page.isHidden('#insights-empty'), true, 'insights empty hidden');

    const stored = await storedState(page);
    assertEqual(stored.version, 1, 'stored version');
    assertEqual(stored.expenses.length, 1, 'stored expenses');
    assertEqual(stored.expenses[0].title, 'Canteen lunch', 'stored title');
    assertEqual(stored.expenses[0].amount, 120, 'stored amount');
    assertEqual(stored.expenses[0].paymentMethod, 'UPI', 'stored payment');
    assertEqual(await page.inputValue('#expense-date'), TODAY, 'form resets after add');
  });

  await test('3. Indian Rupee formatting uses lakh grouping', async (page) => {
    await fillExpense(page, {
      title: 'Semester fee',
      amount: 123456,
      category: 'Education',
      date: DATE_10,
      payment: 'Card',
    });
    const row = await (await rowByTitle(page, 'Semester fee')).textContent();
    assertIncludes(row, '₹1,23,456', 'table amount');
    assertEqual(await text(page, '#spending-amount'), '₹1,23,456', 'card amount');
  });

  await test('4. Empty and too-short titles are rejected', async (page) => {
    await fillExpense(page, {
      title: '',
      amount: 120,
      category: 'Food',
      date: DATE_05,
    });
    assertEqual(await text(page, '#expense-message'), 'Please enter a title for the expense.', 'empty title error');
    assertEqual(await page.getAttribute('#expense-title', 'aria-invalid'), 'true', 'title flagged');
    assertEqual(await dataRowCount(page), 0, 'no row added');

    await page.fill('#expense-title', 'A');
    await submitExpense(page);
    assertEqual(await text(page, '#expense-message'), 'Title must be at least 2 characters.', 'short title error');
    assertEqual(await dataRowCount(page), 0, 'still no row');

    await page.fill('#expense-title', 'Lunch');
    assertEqual(await page.getAttribute('#expense-title', 'aria-invalid'), null, 'flag cleared on edit');
  });

  await test('5. Zero and negative amounts are rejected', async (page) => {
    await fillExpense(page, {
      title: 'Bad amount',
      amount: 0,
      category: 'Food',
      date: DATE_05,
    });
    assertEqual(await text(page, '#expense-message'), 'Amount must be greater than zero.', 'zero rejected');

    await page.fill('#expense-amount', '-50');
    await submitExpense(page);
    assertEqual(await text(page, '#expense-message'), 'Amount must be greater than zero.', 'negative rejected');
    assertEqual(await page.getAttribute('#expense-amount', 'aria-invalid'), 'true', 'amount flagged');
    assertEqual(await dataRowCount(page), 0, 'no row added');

    await page.fill('#expense-amount', '50');
    assertEqual(await page.getAttribute('#expense-amount', 'aria-invalid'), null, 'flag cleared');
  });

  await test('6. Category, date and payment method are validated', async (page) => {
    await fillExpense(page, {
      title: 'Valid entry',
      amount: 50,
      category: undefined,
      date: '',
      payment: null,
    });
    assertEqual(await text(page, '#expense-message'), 'Please choose a valid category.', 'category required');

    await page.selectOption('#expense-category', 'Food');
    await submitExpense(page);
    assertEqual(await text(page, '#expense-message'), 'Please enter a valid date.', 'date required');

    await page.fill('#expense-date', DATE_05);
    await submitExpense(page);
    assertEqual(await text(page, '#expense-message'), 'Please choose a payment method.', 'payment required');
    assertEqual(await page.getAttribute('fieldset', 'aria-invalid'), 'true', 'payment fieldset flagged');

    await page.check('#pay-cash');
    await submitExpense(page);
    assertEqual(await dataRowCount(page), 1, 'row added after fixing errors');
    assertIncludes(await text(page, '#expense-message'), 'Added', 'success after fixing');
  });

  await test('7. Accidental duplicate submissions are prevented', async (page) => {
    await fillExpense(page, {
      title: 'Coffee',
      amount: 40,
      category: 'Food',
      date: DATE_05,
      payment: 'UPI',
      submit: false,
    });

    // Two submits in the same tick, as an accidental double click would fire.
    await page.evaluate(() => {
      const form = document.getElementById('expense-form');
      form.requestSubmit();
      form.requestSubmit();
    });
    assertEqual(await dataRowCount(page), 1, 'double submit creates one row');
    assertIncludes(await text(page, '#expense-message'), 'Added', 'first submission succeeded');

    // Re-entering the identical expense is caught by the duplicate guard.
    await fillExpense(page, {
      title: 'Coffee',
      amount: 40,
      category: 'Food',
      date: DATE_05,
      payment: 'UPI',
    });
    assertEqual(await dataRowCount(page), 1, 'duplicate not stored');
    assertIncludes(await text(page, '#expense-message'), 'Duplicate', 'duplicate message');
  });

  await test('8. Budget can be set, updated, and warns when exceeded', async (page) => {
    await page.fill('#monthly-budget', '5000');
    await page.click('#budget-submit');
    assertEqual(await text(page, '#budget-amount'), '₹5,000', 'budget card');
    assertIncludes(await text(page, '#budget-message'), 'saved', 'budget success message');
    assertEqual(await page.isHidden('#budget-warning'), true, 'no warning under 80%');

    await fillExpense(page, {
      title: 'Lunch',
      amount: 120,
      category: 'Food',
      date: DATE_05,
    });
    assertEqual(await text(page, '#remaining-amount'), '₹4,880', 'remaining after spend');
    assertEqual(await page.isHidden('#budget-warning'), true, 'still no warning');

    await page.fill('#monthly-budget', '100');
    await page.click('#budget-submit');
    assertEqual(await text(page, '#budget-amount'), '₹100', 'updated budget card');
    assertEqual(await text(page, '#remaining-amount'), '-₹20', 'negative remaining');
    assertIncludes(await page.getAttribute('#remaining-amount', 'class'), 'is-negative', 'negative styling');
    assertIncludes(await text(page, '#budget-warning'), 'Budget exceeded by ₹20', 'exceeded warning');
    assertIncludes(await page.getAttribute('#budget-warning', 'class'), 'error', 'warning severity');

    await page.fill('#monthly-budget', '0');
    await page.click('#budget-submit');
    assertEqual(await text(page, '#budget-message'), 'Budget must be greater than zero.', 'budget validation');
    assertEqual(await text(page, '#budget-amount'), '₹100', 'invalid budget not applied');

    const stored = await storedState(page);
    assertEqual(stored.budgets[MONTH_KEY], 100, 'budget persisted');
  });

  await test('9. Warning appears at 80% budget usage', async (page) => {
    await page.fill('#monthly-budget', '1000');
    await page.click('#budget-submit');
    await fillExpense(page, {
      title: 'Books',
      amount: 850,
      category: 'Education',
      date: DATE_05,
    });
    assertEqual(await text(page, '#remaining-amount'), '₹150', 'remaining');
    assertIncludes(await page.getAttribute('#budget-warning', 'class'), 'warning', 'warning class');
    assertIncludes(await text(page, '#budget-warning'), '85%', 'usage percentage');
  });

  await test('10. Expense can be edited and edit can be cancelled', async (page) => {
    await fillExpense(page, {
      title: 'Bus ticket',
      amount: 30,
      category: 'Transport',
      date: DATE_05,
    });

    await (await rowByTitle(page, 'Bus ticket')).locator('button[data-action="edit"]').click();
    assertEqual(await page.inputValue('#expense-title'), 'Bus ticket', 'title loaded');
    assertEqual(await page.inputValue('#expense-amount'), '30', 'amount loaded');
    assertEqual(await page.inputValue('#expense-category'), 'Transport', 'category loaded');
    assertEqual(await page.inputValue('#expense-date'), DATE_05, 'date loaded');
    assertEqual(await page.isChecked('#pay-cash'), true, 'payment loaded');
    assertEqual(await text(page, '#expense-submit'), 'Update Expense', 'submit label');
    assertEqual(await page.isVisible('#expense-cancel'), true, 'cancel visible');
    const editingId = await page.inputValue('#expense-id');
    assert(editingId.length > 0, 'hidden id populated');

    await page.fill('#expense-title', 'Bus ticket (return)');
    await page.fill('#expense-amount', '45');
    await page.check('#pay-upi');
    await submitExpense(page);

    assertEqual(await dataRowCount(page), 1, 'no duplicate row');
    assertEqual(await (await rowByTitle(page, 'Bus ticket (return)')).count(), 1, 'edited row present');
    assertEqual(
      await page.locator('#expense-table-body tr:not(.empty-row) td:first-child').first().textContent(),
      'Bus ticket (return)',
      'row shows updated title'
    );
    assertIncludes(await (await rowByTitle(page, 'Bus ticket (return)')).textContent(), '₹45', 'edited amount');
    assertEqual(await text(page, '#spending-amount'), '₹45', 'card recalculated');
    assertIncludes(await text(page, '#expense-message'), 'Updated', 'update message');
    assertEqual(await text(page, '#expense-submit'), 'Add Expense', 'form back to add mode');
    assertEqual(await page.isHidden('#expense-cancel'), true, 'cancel hidden again');
    assertEqual(await page.inputValue('#expense-id'), '', 'hidden id cleared');

    // Cancelling with Escape leaves data untouched.
    await (await rowByTitle(page, 'Bus ticket (return)')).locator('button[data-action="edit"]').click();
    await page.press('#expense-title', 'Escape');
    assertEqual(await page.inputValue('#expense-title'), '', 'form cleared by Escape');
    assertEqual(await text(page, '#expense-submit'), 'Add Expense', 'add mode after Escape');
    assertEqual(await dataRowCount(page), 1, 'data untouched');
  });

  await test('11. Expense can be deleted, with confirmation and empty state', async (page) => {
    await fillExpense(page, { title: 'Coffee', amount: 40, category: 'Food', date: DATE_01, payment: 'UPI' });
    await fillExpense(page, { title: 'Lunch', amount: 100, category: 'Food', date: DATE_05 });

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await (await rowByTitle(page, 'Coffee')).locator('button[data-action="delete"]').click();

    assertIncludes(dialogMessage, 'Coffee', 'confirmation names the expense');
    assertEqual(await dataRowCount(page), 1, 'one row remains');
    assertEqual(await (await rowByTitle(page, 'Coffee')).count(), 0, 'deleted row gone');
    assertEqual(await text(page, '#spending-amount'), '₹100', 'spending recalculated');
    assertIncludes(await text(page, '#history-message'), 'Deleted', 'delete message');

    // Dismissing the confirmation keeps the expense.
    page.once('dialog', async (dialog) => dialog.dismiss());
    await (await rowByTitle(page, 'Lunch')).locator('button[data-action="delete"]').click();
    assertEqual(await dataRowCount(page), 1, 'dismiss keeps the row');

    // Deleting the last expense restores the empty state.
    page.once('dialog', async (dialog) => dialog.accept());
    await (await rowByTitle(page, 'Lunch')).locator('button[data-action="delete"]').click();
    assertEqual(await dataRowCount(page), 0, 'all rows deleted');
    assertIncludes(await text(page, '#expense-table-body'), 'No expenses yet', 'empty state returns');
    assertEqual(await text(page, '#spending-amount'), '₹0', 'spending reset');
    assertEqual(await page.isVisible('#insights-empty'), true, 'insights empty state returns');
  });

  await test('12. Filtering by category and clearing filters', async (page) => {
    await fillExpense(page, { title: 'Snacks', amount: 100, category: 'Food', date: DATE_01 });
    await fillExpense(page, { title: 'Metro', amount: 200, category: 'Transport', date: DATE_10 });
    await fillExpense(page, { title: 'Dinner', amount: 300, category: 'Food', date: DATE_20 });

    await page.selectOption('#filter-category', 'Food');
    assertEqual(await dataRowCount(page), 2, 'Food rows');
    assertEqual(await text(page, '#filter-summary'), 'Showing 2 of 3 expenses, totalling ₹400.', 'summary');
    assertIncludes(await text(page, '#history-caption'), 'Filtered', 'filtered caption');

    await page.selectOption('#filter-category', 'Transport');
    assertEqual(await dataRowCount(page), 1, 'Transport rows');
    assertEqual(await text(page, '#filter-summary'), 'Showing 1 of 3 expenses, totalling ₹200.', 'summary 2');

    await page.click('#clear-filters');
    assertEqual(await dataRowCount(page), 3, 'all rows restored');
    assertEqual(await page.inputValue('#filter-category'), '', 'category reset');
    assertEqual(await text(page, '#filter-summary'), '', 'summary cleared');
    assertEqual(await text(page, '#history-caption'), 'All saved expenses, newest first.', 'caption restored');
  });

  await test('13. Filtering by date range and clearing filters', async (page) => {
    await fillExpense(page, { title: 'Early', amount: 100, category: 'Food', date: DATE_01 });
    await fillExpense(page, { title: 'Middle', amount: 200, category: 'Food', date: DATE_10 });
    await fillExpense(page, { title: 'Late', amount: 300, category: 'Food', date: DATE_20 });

    await setFilter(page, '#filter-from', DATE_10);
    assertEqual(await dataRowCount(page), 2, 'from-date rows');

    await page.click('#clear-filters');
    await setFilter(page, '#filter-to', DATE_05);
    assertEqual(await dataRowCount(page), 1, 'to-date rows');
    assertEqual(await (await rowByTitle(page, 'Early')).count(), 1, 'only early remains');

    await page.click('#clear-filters');
    await setFilter(page, '#filter-from', DATE_10);
    await setFilter(page, '#filter-to', DATE_20);
    assertEqual(await dataRowCount(page), 2, 'range rows');
    assertEqual(await text(page, '#filter-summary'), 'Showing 2 of 3 expenses, totalling ₹500.', 'range summary');

    await page.click('#clear-filters');
    await setFilter(page, '#filter-from', DATE_15);
    assertEqual(await dataRowCount(page), 1, 'narrowed range');
    assertEqual(await (await rowByTitle(page, 'Late')).count(), 1, 'late row only');

    await page.click('#clear-filters');
    assertEqual(await dataRowCount(page), 3, 'all rows restored');
  });

  await test('14. Data and budget survive a refresh', async (page) => {
    await fillExpense(page, {
      title: 'Saved lunch',
      amount: 120,
      category: 'Food',
      date: DATE_05,
      payment: 'UPI',
    });
    await page.fill('#monthly-budget', '5000');
    await page.click('#budget-submit');

    await page.reload();

    assertEqual(await dataRowCount(page), 1, 'row restored');
    assertIncludes(await text(page, '#expense-table-body'), 'Saved lunch', 'title restored');
    assertIncludes(await text(page, '#expense-table-body'), 'UPI', 'payment restored');
    assertEqual(await text(page, '#budget-amount'), '₹5,000', 'budget restored');
    assertEqual(await text(page, '#spending-amount'), '₹120', 'spending restored');
    assertEqual(await text(page, '#remaining-amount'), '₹4,880', 'remaining restored');
    assertEqual(await page.inputValue('#monthly-budget'), '5000', 'budget input restored');
    assertEqual(await page.inputValue('#expense-date'), TODAY, 'date field usable after reload');
    assertEqual(await page.locator('#category-breakdown .category-row').count(), 1, 'breakdown restored');
  });

  await test('15. Missing or invalid stored data is handled safely', async (page) => {
    await page.evaluate(() => localStorage.setItem('spendsmart.v1', '{not valid json'));
    await page.reload();
    assertIncludes(await text(page, '#expense-table-body'), 'No expenses yet', 'corrupt JSON falls back');
    assertEqual(await text(page, '#spending-amount'), '₹0', 'cards reset');
    assertEqual(await text(page, '#remaining-amount'), '—', 'remaining reset');

    const mixedPayload = {
      version: 1,
      expenses: [
        { title: 'Valid stored', amount: '99.5', category: 'Food', date: DATE_05, paymentMethod: 'UPI' },
        { title: 'Negative', amount: -5, category: 'Food', date: DATE_05, paymentMethod: 'Cash' },
        { title: 'Bad category', amount: 10, category: 'Hack', date: DATE_05, paymentMethod: 'Cash' },
        { title: 'Bad date', amount: 10, category: 'Food', date: '2026-13-40', paymentMethod: 'Cash' },
        { title: '', amount: 10, category: 'Food', date: DATE_05, paymentMethod: 'Cash' },
        null,
        'nope',
      ],
      budgets: { [MONTH_KEY]: 'abc', nope: 5000, [NEXT_MONTH_KEY]: 3000 },
    };
    await page.evaluate((payload) => {
      localStorage.setItem('spendsmart.v1', JSON.stringify(payload));
    }, mixedPayload);
    await page.reload();

    assertEqual(await dataRowCount(page), 1, 'only the valid record survives');
    assertIncludes(await text(page, '#expense-table-body'), 'Valid stored', 'valid record shown');
    assertEqual(await text(page, '#spending-amount'), '₹99.5', 'valid amount counted');
    assertEqual(await text(page, '#budget-amount'), '₹0', 'invalid budget ignored');

    await page.evaluate(() => localStorage.setItem('spendsmart.v1', 'null'));
    await page.reload();
    assertIncludes(await text(page, '#expense-table-body'), 'No expenses yet', 'null payload falls back');
    assertEqual(await dataRowCount(page), 0, 'no rows from null payload');
  });

  await test('16. Titles are rendered as text, never as markup', async (page) => {
    const maliciousTitle = '<img src=x onerror="window.__xss=1">';
    await fillExpense(page, {
      title: maliciousTitle,
      amount: 10,
      category: 'Other',
      date: DATE_05,
    });

    assertEqual(await page.locator('#expense-table-body img').count(), 0, 'no injected element');
    assertEqual(await page.evaluate(() => window.__xss), undefined, 'no script executed');
    const cellText = await page.locator('#expense-table-body tr:not(.empty-row) td').first().textContent();
    assertEqual(cellText, maliciousTitle, 'title shown verbatim as text');
  });

  await test('17. Category breakdown ranks spending and shows shares', async (page) => {
    await fillExpense(page, { title: 'Snacks', amount: 100, category: 'Food', date: DATE_01 });
    await fillExpense(page, { title: 'Metro', amount: 300, category: 'Transport', date: DATE_10 });
    await fillExpense(page, { title: 'Shoes', amount: 200, category: 'Shopping', date: DATE_20 });

    const names = await page.locator('#category-breakdown .category-name').allTextContents();
    assertEqual(names.join(','), 'Transport,Shopping,Food', 'ranked order');

    const widths = await page
      .locator('#category-breakdown .category-bar')
      .evaluateAll((bars) => bars.map((bar) => bar.style.width));
    assertEqual(widths[0], '100%', 'largest bar fills the track');
    assert(parseFloat(widths[1]) < parseFloat(widths[0]), 'second bar shorter than first');
    assert(parseFloat(widths[2]) < parseFloat(widths[1]), 'third bar shorter than second');

    const breakdownText = await text(page, '#category-breakdown');
    assertIncludes(breakdownText, '50%', 'Transport share');
    assertIncludes(await text(page, '#insights-caption'), '₹600', 'monthly total caption');
    assertIncludes(await text(page, '#insights-caption'), MONTH_LABEL, 'month in caption');
  });

  await browser.close();

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;

  console.log(`\n${results.length} tests — ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

run().catch(async (error) => {
  console.error('Test runner crashed:', error);
  if (browser) await browser.close();
  process.exitCode = 1;
});
