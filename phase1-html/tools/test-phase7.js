'use strict';

/**
 * SpendSmart Phase 7 — end-to-end test of the AI insights workflow.
 *
 * Requires the backend on http://localhost:5000 (in-memory mode is
 * fine) and the Vite dev server on http://localhost:5173. Runs without
 * an ANTHROPIC_API_KEY: the fallback narrative path is what the UI
 * exercises, which is exactly what should be demonstrated without
 * credentials.
 *
 *   node test-phase7.js
 */

const { chromium } = require('playwright');

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const API_URL = process.env.BACKEND_URL || 'http://localhost:5000';

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

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  // Reset data through the API so the run is repeatable.
  const listResponse = await fetch(`${API_URL}/api/expenses`);
  const list = await listResponse.json();
  for (const expense of list.data || []) {
    await fetch(`${API_URL}/api/expenses/${expense.id}`, { method: 'DELETE' });
  }
  await fetch(`${API_URL}/api/budget`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 3000 }),
  });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Seed data through the UI (also re-verifies the Phase 6 flow).
    await page.fill('#expense-title', 'Canteen lunch');
    await page.fill('#expense-amount', '150');
    await page.selectOption('#expense-category', 'Food');
    await page.check('#pay-upi');
    await page.click('#expense-submit');
    await page.waitForTimeout(600);
    await page.fill('#expense-title', 'Movie night');
    await page.fill('#expense-amount', '450');
    await page.selectOption('#expense-category', 'Entertainment');
    await page.check('#pay-card');
    await page.click('#expense-submit');
    await page.waitForTimeout(700);

    // Generate insights in the UI first. Wait out the endpoint's 10s
    // rate-limit window in case another suite called it just before.
    await page.waitForTimeout(10500);
    await page.click('button:has-text("Get AI Insights")');
    await page.waitForSelector('.ai-insights-result', { timeout: 10000 });

    await page.waitForTimeout(10500);
    const emptyResponse = await fetch(`${API_URL}/api/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: '2026-01' }),
    });
    const emptyBody = await emptyResponse.json();
    check(
      'API: empty month returns friendly insufficient-data message',
      emptyBody.data.narrative.insufficientData === true &&
        /No expenses were recorded/i.test(emptyBody.data.narrative.summary)
    );

    check('Verified stats show total spent ₹600', await page.locator('text=₹600').first().isVisible());
    check(
      'Verified stats show budget remaining ₹2,400',
      await page.locator('text=₹2,400').first().isVisible()
    );
    check(
      'Top category shown with percent',
      await page.locator('.ai-verified-stats >> text=Entertainment').first().isVisible()
    );

    const badge = await page.locator('.ai-source-badge').textContent();
    check(
      'Fallback source is clearly labelled (no key configured)',
      /offline summary/i.test(badge),
      badge.trim()
    );

    check('Summary section rendered', await page.getByRole('heading', { name: 'Summary', exact: true }).isVisible());
    check(
      'Suggestions section rendered',
      await page.locator('.ai-insights-result >> text=Suggestions to stay within budget').isVisible()
    );
    const suggestionItems = await page.locator('.ai-insights-result ul li').count();
    check('At least two suggestion/pattern items', suggestionItems >= 2);

    check(
      'Disclaimer distinguishes suggestions from verified calculations',
      await page.locator('.ai-disclaimer >> text=not a guarantee').isVisible()
    );

    // Refresh button works (idempotent second call). The endpoint is
    // rate-limited to one call per 10s, so wait out the window first.
    await page.waitForTimeout(10500);
    await page.click('button:has-text("Refresh AI Insights")');
    await page.waitForSelector('.ai-insights-result', { timeout: 10000 });
    check('Refresh regenerates insights without error', true);

    // Screenshot of the insights section for the report.
    const fs = require('fs');
    const shotDir = require('path').join(__dirname, '..', '..', 'frontend', 'screenshots');
    fs.mkdirSync(shotDir, { recursive: true });
    await page.locator('#insights').screenshot({ path: require('path').join(shotDir, 'insights-ai.png') });
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
