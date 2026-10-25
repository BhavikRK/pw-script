import { test, expect, Route } from '@playwright/test';

/*
 * How the Toolshop front end behaves when its API does: a rewritten response, a slow API, an outage,
 * and blocked third parties. Every scenario intercepts the browser's own calls with page.route, so
 * the real site is used and nothing on the server is changed.
 */
const BASE_URL = 'https://practicesoftwaretesting.com';
// The catalog's list call, with whatever paging, sorting and filter parameters the page adds.
const PRODUCTS = /api\.practicesoftwaretesting\.com\/products(\?|$)/;

test('the catalog renders whatever the API returns', async ({ page }) => {
    // Take the live response and change only the first product: a contract check that the UI shows
    // the API's data rather than anything cached or hardcoded.
    await page.route(PRODUCTS, async (route: Route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.data[0] = { ...body.data[0], name: 'ASM Monitored Wrench', price: 1234.5, in_stock: true };
        await route.fulfill({ response, json: body });
    });
    await page.goto(BASE_URL);

    const card = page.locator('a.card').first();
    await expect(card.locator('[data-test="product-name"]')).toHaveText('ASM Monitored Wrench');
    await expect(card.locator('[data-test="product-price"]')).toHaveText('$1234.50');
});

test('a slow API delays the catalog but does not break it', async ({ page }) => {
    const delayMs = 4000;
    await page.route(PRODUCTS, async route => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        await route.continue();
    });

    const started = Date.now();
    await page.goto(BASE_URL);
    await expect(page.locator('a.card').first()).toBeVisible({ timeout: delayMs + 15000 });
    const elapsed = Date.now() - started;

    // The products could not have arrived before the injected delay; if they did, the route
    // pattern no longer matches the API and this check is not testing what it says.
    expect(elapsed).toBeGreaterThanOrEqual(delayMs);
    // The shell of the page must not wait for the API: search is usable while products load.
    await expect(page.locator('[data-test="search-query"]')).toBeEditable();
});

test('an API outage leaves an empty catalog, not a crashed page', async ({ page }) => {
    const uncaught: string[] = [];
    page.on('pageerror', error => uncaught.push(error.message));
    await page.route(PRODUCTS, route =>
        route.fulfill({ status: 503, json: { message: 'Service Unavailable' } }));

    const failed = page.waitForResponse(r => PRODUCTS.test(r.url()) && r.status() === 503);
    await page.goto(BASE_URL);
    await failed;

    await expect(page.locator('a.card')).toHaveCount(0);
    // Navigation, filters and search still render: the outage is contained to the product grid.
    await expect(page.locator('[data-test="nav-home"]')).toBeVisible();
    await expect(page.locator('[data-test="sort"]')).toBeVisible();
    await expect(page.locator('[data-test="search-query"]')).toBeEditable();
    expect(uncaught, uncaught.join('\n')).toEqual([]);

    // Once the API recovers, a reload is all it takes.
    await page.unroute(PRODUCTS);
    await page.reload();
    await expect(page.locator('a.card').first()).toBeVisible();
});

test('the shop works with images and analytics blocked', async ({ page }) => {
    let blocked = 0;
    // What a privacy extension or a corporate proxy does to a visitor.
    await page.route(/\.(png|jpe?g|webp|avif|gif|svg)(\?|$)|google-analytics|googletagmanager/, route => {
        blocked++;
        return route.abort();
    });

    await page.goto(BASE_URL);
    await page.locator('[data-test="search-query"]').fill('hammer');
    await page.locator('[data-test="search-submit"]').click();
    await expect(page.locator('[data-test="search_completed"]')).toBeVisible();

    const names = await page.locator('[data-test="product-name"]').allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(/hammer/i);
    expect(blocked, 'nothing was blocked - the route patterns no longer match').toBeGreaterThan(0);
});
