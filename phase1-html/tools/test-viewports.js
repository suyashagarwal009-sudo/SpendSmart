const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();

  const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'tablet',  width: 768,  height: 1024 },
    { name: 'mobile',  width: 375,  height: 812 },
  ];

  const pageDir = path.join(__dirname, '..');
  let filePath = 'file://' + pageDir.split(path.sep).join('/');
  filePath += '/index.html';

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.name === 'mobile',
    });
    const page = await context.newPage();
    await page.goto(filePath);
    await page.waitForLoadState('networkidle');

    // Check for horizontal overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    // Check table specifically
    const tableOverflow = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return false;
      const wrapper = table.closest('.table-scroll');
      if (wrapper) {
        return wrapper.scrollWidth > wrapper.clientWidth;
      }
      return table.scrollWidth > table.clientWidth;
    });

    const screenshotName = path.join(__dirname, '..', 'screenshots', `screenshot-${vp.name}.png`);
    await page.screenshot({ path: screenshotName, fullPage: true });

    console.log(`[${vp.name} ${vp.width}x${vp.height}] page overflow: ${overflow}, table overflow: ${tableOverflow}, screenshot: ${screenshotName}`);

    await context.close();
  }

  await browser.close();
  console.log('All viewport tests complete.');
})();
