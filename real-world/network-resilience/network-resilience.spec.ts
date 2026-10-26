import { test, expect, Route } from '@playwright/test';

/*
 * How the Demoblaze front end behaves when its API (api.demoblaze.com) does: a rewritten response,
 * a slow API, an outage and its recovery, and blocked images and analytics. Every scenario
 * intercepts the browser's own calls with page.route, so the real site is used and nothing on the
 * server changes.
 */
const BASE_URL = 'https://www.demoblaze.com';
// The home page's catalog call.
const ENTRIES = /api\.demoblaze\.com\/entries$/;

// Check agents run Chromium in containers with a small /dev/shm, where it crashes renderers.
test.use({ launchOptions: { args: ['--disable-dev-shm-usage'] } });

const cards = (page: import('@playwright/test').Page) => page.locator('#tbodyid .card');

test('the catalog renders whatever the API returns', async ({ page }) => {
    // Take the live response and change only the first product: a contract check that the UI shows
    // the API's data rather than anything cached or hardcoded.
    await page.route(ENTRIES, async (route: Route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.Items[0] = { ...body.Items[0], title: 'ASM Monitored Phone', price: 1234 };
        await route.fulfill({ response, json: body });
    });
    await page.goto(BASE_URL);

    const first = cards(page).first();
    await expect(first.locator('.card-title')).toHaveText('ASM Monitored Phone');
    await expect(first.locator('h5')).toHaveText('$1234');
});

test('a slow API delays the catalog but not the page around it', async ({ page }) => {
    const delayMs = 4000;
    await page.route(ENTRIES, async route => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        await route.continue();
    });

    const started = Date.now();
    await page.goto(BASE_URL);
    // The shell does not wait for the API: navigation is usable while products load.
    await expect(page.locator('#login2')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Laptops' })).toBeVisible();

    await expect(cards(page).first()).toBeVisible({ timeout: delayMs + 15000 });
    // The products cannot have arrived before the injected delay; if they did, the route pattern no
    // longer matches the API and this check is not testing what it says.
    expect(Date.now() - started).toBeGreaterThanOrEqual(delayMs);
});

test('an API outage leaves an empty catalog, and a reload recovers', async ({ page }) => {
    await page.route(ENTRIES, route => route.fulfill({ status: 503, json: { message: 'Service Unavailable' } }));

    const failed = page.waitForResponse(r => ENTRIES.test(r.url()) && r.status() === 503);
    await page.goto(BASE_URL);
    await failed;

    await expect(cards(page)).toHaveCount(0);
    // The outage is contained to the product grid: navigation and categories still render.
    await expect(page.locator('#login2')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Phones' })).toBeVisible();

    // Categories use a different endpoint, so they still work while /entries is down.
    const byCat = page.waitForResponse(r => r.url().endsWith('/bycat') && r.ok());
    await page.getByRole('link', { name: 'Monitors' }).click();
    await byCat;
    await expect(cards(page).first()).toBeVisible();

    await page.unroute(ENTRIES);
    await page.reload();
    await expect(cards(page).first()).toBeVisible();
});

test('the store works with images and analytics blocked', async ({ page }) => {
    let blocked = 0;
    // What a privacy extension or a corporate proxy does to a visitor.
    await page.route(/\.(png|jpe?g|webp|gif)(\?|$)|google-analytics|googletagmanager/, route => {
        blocked++;
        return route.abort();
    });

    await page.goto(BASE_URL);
    const byCat = page.waitForResponse(r => r.url().endsWith('/bycat') && r.ok());
    await page.getByRole('link', { name: 'Laptops' }).click();
    const laptops = ((await (await byCat).json()).Items as { title: string }[]).map(i => i.title);
    await expect(cards(page).locator('.card-title')).toHaveText(laptops);
    expect(blocked, 'nothing was blocked - the route patterns no longer match').toBeGreaterThan(0);
});
