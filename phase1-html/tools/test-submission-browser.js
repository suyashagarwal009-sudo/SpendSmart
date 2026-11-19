'use strict';

/**
 * Submission audit — browser-level checks: console errors, page errors,
 * failed requests, responsiveness, and accessibility basics across the
 * full expense + insights workflow. Requires both servers running.
 *
 *   node test-submission-browser.js
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

async function main() {
  // Reset data
  const listResponse = await fetch(`${API_URL}/api/expenses`);
  const list = await listResponse.json();
  for (const expense of list.data || []) {
    await fetch(`${API_URL}/api/expenses/${expense.id}`, { method: 'DELETE' });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Full workflow: add, edit, filter, insights
    await page.fill('#expense-title', 'Audit lunch');
    await page.fill('#expense-amount', '150');
    await page.selectOption('#expense-category', 'Food');
    await page.check('#pay-upi');
    await page.click('#expense-submit');
    await page.waitForTimeout(600);
    await page.fill('#expense-title', 'Audit movie');
    await page.fill('#expense-amount', '450');
    await page.selectOption('#expense-category', 'Entertainment');
    await page.check('#pay-card');
    await page.click('#expense-submit');
    await page.waitForTimeout(700);

    await page.click('button[aria-label="Edit Audit lunch"]');
    await page.fill('#expense-amount', '175');
    await page.click('#expense-submit');
    await page.waitForTimeout(700);

    await page.selectOption('#filter-category', 'Food');
    await page.waitForTimeout(300);
    check('Filtering works', (await page.locator('tbody tr').count()) === 1);
    await page.click('text=Clear Filters');
    await page.waitForTimeout(300);

    await page.click('button:has-text("Get AI Insights")');
    await page.waitForSelector('.ai-insights-result', { timeout: 10000 });
    check('AI insights panel renders', true);

    // Responsiveness at three viewports
    for (const vp of [
      { name: 'desktop', width: 1280, height: 900 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 812 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      check(`No page-level overflow at ${vp.name}`, !overflow);
    }

    // Accessibility basics
    await page.setViewportSize({ width: 1280, height: 900 });
    const a11y = await page.evaluate(() => {
      const results = {};
      results.imagesWithoutAlt = [...document.querySelectorAll('img')].filter(
        (img) => !img.hasAttribute('alt')
      ).length;
      results.inputsUnlabelled = [...document.querySelectorAll('input, select')].filter(
        (el) => {
          if (el.type === 'hidden') return false;
          const label = el.labels && el.labels.length > 0;
          const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
          return !label && !aria;
        }
      ).length;
      results.buttonsUnlabelled = [...document.querySelectorAll('button')].filter(
        (el) => !el.textContent.trim() && !el.getAttribute('aria-label')
      ).length;
      results.langSet = document.documentElement.lang === 'en';
      results.headings = document.querySelectorAll('h1, h2, h3').length;
      return results;
    });
    check('All images have alt text', a11y.imagesWithoutAlt === 0, String(a11y.imagesWithoutAlt));
    check('All inputs are labelled', a11y.inputsUnlabelled === 0, String(a11y.inputsUnlabelled));
    check('All buttons are labelled', a11y.buttonsUnlabelled === 0, String(a11y.buttonsUnlabelled));
    check('Document language is set', a11y.langSet === true);
    check('Page has a heading structure', a11y.headings >= 5, String(a11y.headings));

    // Console / runtime / network errors (Vite dev overlay excluded)
    const realConsoleErrors = consoleErrors.filter(
      (text) => !/Download the React DevTools/.test(text)
    );
    check('No browser console errors', realConsoleErrors.length === 0, realConsoleErrors.join(' | '));
    check('No uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
    check('No failed network requests', failedRequests.length === 0, failedRequests.join(' | '));
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
