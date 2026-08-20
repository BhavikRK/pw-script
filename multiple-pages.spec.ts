import { test, expect } from '@playwright/test';

test('single test using two pages', async ({ browser }) => {
  // Create two independent contexts (like two different users)
  const context1 = await browser.newContext();

  // Open a page in each context
  const page1 = await context1.newPage();

  // Navigate both pages
  await page1.goto('https://playwright.dev');

  // Click the get started link.
  await page1.getByRole('link', { name: 'Get started' }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(page1.getByRole('heading', { name: 'Installation' })).toBeVisible();

  // Interact with page1 (Playwright site)
  await expect(page1).toHaveTitle(/Playwright/);
  await page1.click('text=Get started');
  const header1 = await page1.locator('h1').textContent();
  console.log('Page1 header:', header1);

  const page2 = await context1.newPage();


  await page2.goto('https://www.wikipedia.org');


  // Interact with page2 (Wikipedia site)
  await expect(page2).toHaveTitle(/Wikipedia/);
  await page2.fill('input[name="search"]', 'Playwright');
  await page2.press('input[name="search"]', 'Enter');
  await page2.waitForLoadState('domcontentloaded');
  const firstHeading = await page2.locator('#firstHeading').textContent();
  console.log('Page1 heading:', firstHeading);

  const navigationTimingJson = await page1.evaluate(() =>
      JSON.stringify(performance.getEntriesByType('navigation'))
  )

  const navigationTimingJson2 = await page2.evaluate(() =>
      JSON.stringify(performance.getEntriesByType('navigation'))
  )
  const navigationTiming = JSON.parse(navigationTimingJson)
  console.log("navigationTiming console", navigationTiming)

  const navigationTiming2 = JSON.parse(navigationTimingJson2)
  console.log("navigationTiming2 console", navigationTiming2)


  // Close contexts
  await context1.close();
});
