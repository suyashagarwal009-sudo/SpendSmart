'use strict';

/**
 * SpendSmart Phase 6 — responsive-layout check for the React frontend.
 * Requires the Vite dev server on http://localhost:5173.
 *
 *   node test-phase6-viewports.js
 */

const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch();

  const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 812 },
  ];

  let failures = 0;

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.name === 'mobile',
    });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );

    const tableOverflow = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return false;
      const wrapper = table.closest('.table-scroll');
      if (wrapper) return wrapper.scrollWidth > wrapper.clientWidth;
      return table.scrollWidth > table.clientWidth;
    });

    const shotDir = path.join(__dirname, '..', '..', 'frontend', 'screenshots');
    const fs = require('fs');
    fs.mkdirSync(shotDir, { recursive: true });
    const screenshotName = path.join(shotDir, `screenshot-${vp.name}.png`);
    await page.screenshot({ path: screenshotName, fullPage: true });

    const ok = !overflow;
    if (!ok) failures += 1;
    console.log(
      `[${vp.name} ${vp.width}x${vp.height}] page overflow: ${overflow}, table overflow: ${tableOverflow}, screenshot: ${screenshotName}`
    );

    await context.close();
  }

  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
})();
