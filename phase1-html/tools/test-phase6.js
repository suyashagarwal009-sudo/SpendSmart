'use strict';

/**
 * SpendSmart Phase 6 — end-to-end workflow test for the React frontend.
 *
 * Requires the backend on http://localhost:5000 and the Vite dev server
 * on http://localhost:5173. Exercises the full expense workflow through
 * the real UI: load, add, edit, budget, filter, chart, delete.
 *
 *   node test-phase6.js
 */

const { chromium } = require('playwright');

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${passed}. ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);

  try {
    // 0. Reset: remove any expenses left over from previous runs so the
    // run always starts from a clean slate.
    const listResponse = await fetch('http://localhost:5000/api/expenses');
    const list = await listResponse.json();
    for (const expense of list.data || []) {
      await fetch(`http://localhost:5000/api/expenses/${expense.id}`, { method: 'DELETE' });
    }
    const budgetResponse = await fetch('http://localhost:5000/api/budget');
    const budgetData = await budgetResponse.json();
    if (budgetData.data && budgetData.data.budget) {
      await fetch('http://localhost:5000/api/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1 }),
      });
    }

    // 1. Initial load
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    check('Dashboard loads with heading', await page.locator('h2#dashboard-heading').isVisible());
    check(
      'Loading indicator is gone after data loads',
      (await page.locator('.app-status').count()) === 0
    );

    // 2. Add an expense
    await page.fill('#expense-title', 'Bus pass');
    await page.fill('#expense-amount', '250');
    await page.selectOption('#expense-category', 'Transport');
    await page.check('#pay-upi');
    await page.click('#expense-submit');
    await page.waitForFunction(() =>
      document.querySelector('#expense-submit')?.textContent.includes('Add Expense')
    );
    await page.waitForTimeout(500);
    const firstRow = page.locator('tbody tr').first();
    check('Added expense appears in the table', (await firstRow.textContent()).includes('Bus pass'));
    check(
      'Summary total spending updates after add',
      await page.locator('text=₹250').first().isVisible()
    );

    // 3. Add a second expense in another category
    await page.fill('#expense-title', 'Canteen lunch');
    await page.fill('#expense-amount', '120.50');
    await page.selectOption('#expense-category', 'Food');
    await page.check('#pay-cash');
    await page.click('#expense-submit');
    await page.waitForTimeout(700);
    check('Second expense appears in the table', (await page.locator('tbody tr').count()) === 2);

    // 4. Client-side validation blocks an invalid submission
    await page.fill('#expense-title', 'x');
    await page.fill('#expense-amount', '-5');
    await page.click('#expense-submit');
    await page.waitForTimeout(300);
    check(
      'Validation error shown for invalid input',
      (await page.locator('.form-message.error').count()) > 0
    );
    check('Invalid expense was not added', (await page.locator('tbody tr').count()) === 2);

    // 5. Edit the first expense
    await page.click('button[aria-label="Edit Bus pass"]');
    await page.waitForTimeout(300);
    check('Edit mode shows Save Changes button', await page.locator('#expense-submit:has-text("Save Changes")').isVisible());
    await page.fill('#expense-amount', '300');
    await page.click('#expense-submit');
    await page.waitForTimeout(700);
    check(
      'Edited amount appears in the table',
      (await page.locator('tbody tr:has-text("Bus pass")').textContent()).includes('₹300')
    );

    // 6. Cancel edit returns the form to add mode
    await page.click('button[aria-label="Edit Bus pass"]');
    await page.click('text=Cancel Edit');
    await page.waitForTimeout(300);
    check('Cancel edit restores Add Expense form', await page.locator('#expense-submit:has-text("Add Expense")').isVisible());

    // 7. Set the monthly budget
    await page.fill('#monthly-budget', '1000');
    await page.click('#budget-submit');
    await page.waitForTimeout(700);
    check(
      'Budget card updates after save',
      (await page.locator('.summary-cards .card').first().textContent()).includes('1,000')
    );
    check(
      'Remaining balance card shows a value (not dash)',
      !(await page.locator('.summary-cards .card').nth(2).textContent()).includes('—')
    );
    const remainingText = await page.locator('.summary-cards .card').nth(2).textContent();
    check('Remaining = 1000 - 420.50 = ₹579.50', remainingText.includes('579.5'), remainingText.trim());

    // 8. Category chart shows both categories
    check('Chart shows Transport category', await page.locator('.category-name:has-text("Transport")').isVisible());
    check('Chart shows Food category', await page.locator('.category-name:has-text("Food")').isVisible());
    const chartRows = await page.locator('.category-row').count();
    check('Chart has exactly 2 category rows', chartRows === 2);

    // 9. Filters
    await page.selectOption('#filter-category', 'Food');
    await page.waitForTimeout(300);
    check('Category filter narrows the table to 1 row', (await page.locator('tbody tr').count()) === 1);
    check('Filter summary is displayed', await page.locator('.filter-summary').isVisible());
    await page.click('text=Clear Filters');
    await page.waitForTimeout(300);
    check('Clear Filters restores both rows', (await page.locator('tbody tr').count()) === 2);

    // 10. Delete with confirmation
    page.once('dialog', (dialog) => dialog.accept());
    await page.click('button[aria-label="Delete Canteen lunch"]');
    await page.waitForTimeout(700);
    check('Deleted expense disappears from the table', (await page.locator('tbody tr').count()) === 1);

    // 11. Persistence: reload pulls data from the API
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    check(
      'Data persists across reload (fetched from API)',
      (await page.locator('tbody tr:has-text("Bus pass")').count()) === 1
    );

    // 12. Accessibility spot checks
    check('Main navigation has aria-label', (await page.locator('nav[aria-label="Main navigation"]').count()) === 1);
    check('Expense form is labelled', (await page.locator('form[aria-label="Add a new expense"]').count()) === 1);
  } catch (error) {
    failed += 1;
    console.error('FAIL — unexpected error:', error.message);
  } finally {
    await browser.close();
  }

  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
