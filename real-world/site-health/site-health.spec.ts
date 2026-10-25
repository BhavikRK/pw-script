import { test, expect, Page, ConsoleMessage, Request } from '@playwright/test';

/*
 * What a synthetic monitor checks on a public site beyond "the page loads": load-time budgets from
 * the Navigation Timing API, a clean console, no failed first-party requests, the links a visitor
 * would click, the basics search engines rely on, and a real visitor journey through docs search.
 *
 * Budgets are in milliseconds and can be tuned per location without editing the check:
 * --envVars BUDGET_TTFB_MS=800 BUDGET_DCL_MS=2500 BUDGET_LOAD_MS=4000
 */
const SITE = process.env.SITE_URL ?? 'https://playwright.dev';
const BUDGET = {
    ttfb: Number(process.env.BUDGET_TTFB_MS ?? 1500),
    domContentLoaded: Number(process.env.BUDGET_DCL_MS ?? 4000),
    load: Number(process.env.BUDGET_LOAD_MS ?? 6000),
};

/** Collects what went wrong while a page was in use: console errors, page errors, failed requests. */
function watch(page: Page) {
    const origin = new URL(SITE).origin;
    const problems: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', error => problems.push(`uncaught: ${error.message}`));
    page.on('requestfailed', (request: Request) => {
        if (request.url().startsWith(origin)) problems.push(`failed: ${request.url()} (${request.failure()?.errorText})`);
    });
    page.on('response', response => {
        if (response.url().startsWith(origin) && response.status() >= 400) {
            problems.push(`HTTP ${response.status()}: ${response.url()}`);
        }
    });
    return problems;
}

test('home page meets its load budget with a clean console', async ({ page }, testInfo) => {
    const problems = watch(page);
    await page.goto(SITE, { waitUntil: 'load' });

    const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        return {
            ttfb: Math.round(nav.responseStart - nav.requestStart),
            domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
            load: Math.round(nav.loadEventEnd - nav.startTime),
            transferKb: Math.round(nav.transferSize / 1024),
            resources: performance.getEntriesByType('resource').length,
        };
    });
    // Published with the result, so the numbers are there even when every budget is met.
    await testInfo.attach('navigation-timing.json', { body: JSON.stringify(timing, null, 2), contentType: 'application/json' });

    // Soft: one blown budget should not hide the others, or the problems below.
    expect.soft(timing.ttfb, 'time to first byte').toBeLessThan(BUDGET.ttfb);
    expect.soft(timing.domContentLoaded, 'DOMContentLoaded').toBeLessThan(BUDGET.domContentLoaded);
    expect.soft(timing.load, 'load event').toBeLessThan(BUDGET.load);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Late errors from lazy-loaded scripts count too.
    await page.waitForLoadState('networkidle');
    expect(problems, problems.join('\n')).toEqual([]);
});

test('search engines get what they need', async ({ page }) => {
    await page.goto(SITE);

    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{50,}/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https:\/\//);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\//);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const imagesWithoutAlt = await page.locator('main img:not([alt])').count();
    expect.soft(imagesWithoutAlt, 'images in <main> without an alt attribute').toBe(0);
});

test('every link in the header and footer resolves', async ({ page, request }) => {
    const origin = new URL(SITE).origin;
    await page.goto(SITE);
    const hrefs = await page.locator('nav.navbar a[href], footer a[href]').evaluateAll(links =>
        links.map(a => (a as HTMLAnchorElement).href).filter(href => href.startsWith('http')));
    const unique = [...new Set(hrefs.map(href => href.split('#')[0]))];
    expect(unique.length).toBeGreaterThan(5);

    const broken: string[] = [];
    for (const url of unique) {
        const firstParty = url.startsWith(origin);
        // Some hosts refuse HEAD; a GET is what a visitor's browser sends anyway.
        const response = await request.get(url, { maxRedirects: 5, failOnStatusCode: false, timeout: 15000 })
            .catch(error => ({ status: () => 0, statusText: () => String(error.message).split('\n')[0] }));
        const status = response.status();
        // Our own links must all work. Third-party sites often answer an automated client with
        // 401/403/429 (bot protection, rate limits), which says nothing about the link; only a
        // missing page, a server error or no answer at all counts there.
        const isBroken = firstParty
            ? status === 0 || status >= 400
            : status === 0 || status === 404 || status === 410 || status >= 500;
        if (isBroken) broken.push(`${status} ${url} ${response.statusText()}`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
});

test('a visitor finds the locators guide through search', async ({ page }) => {
    const problems = watch(page);
    await page.goto(SITE);

    await page.getByRole('button', { name: /search/i }).first().click();
    await page.getByRole('searchbox', { name: 'Search' }).fill('locators');
    // Search results come from a hosted index; this is the slowest dependency of the journey.
    const hit = page.getByRole('option').filter({ hasText: /Locators/ }).first();
    await expect(hit).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/docs\/locators/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Locators');
    // Deep links into the page must land on a real anchor.
    const firstAnchor = await page.locator('main h2[id]').first().getAttribute('id');
    await page.goto(`${SITE}/docs/locators#${firstAnchor}`);
    await expect(page.locator(`[id="${firstAnchor}"]`)).toBeInViewport();
    expect(problems, problems.join('\n')).toEqual([]);
});
