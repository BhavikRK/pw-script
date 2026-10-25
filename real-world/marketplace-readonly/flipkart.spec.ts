import { test, expect, Page } from '@playwright/test';

/*
 * READ-ONLY, MANUAL-RUN SAMPLE. Do not schedule this as a recurring check.
 *
 * Flipkart's Terms of Use do not allow automated access. This sample never logs in or buys
 * anything: it searches, sorts, and opens a product page, and it SKIPS (does not fail) when the site
 * answers with a bot challenge instead of a page.
 *
 * Flipkart's class names are generated and change between releases, so nothing here depends on
 * them: results are found by their product id attribute and product links, prices by the rupee
 * sign, and the product's facts by the schema.org data the page publishes for search engines.
 */
const BASE_URL = 'https://www.flipkart.com';
const TERM = process.env.SEARCH_TERM ?? 'wireless mouse';
const KEYWORD = process.env.SEARCH_KEYWORD ?? 'mouse';

test.use({ locale: 'en-IN', viewport: { width: 1366, height: 900 } });

const rupees = (text: string) => Number(text.replace(/[^0-9]/g, ''));

const cards = (page: Page) => page.locator('div[data-id]').filter({ has: page.locator('a[href*="/p/"]') });

/** The first ₹ amount on each card is its selling price; the struck-out MRP follows it. */
async function cardPrices(page: Page, count = 12) {
    return (await cards(page).evaluateAll((els, n) => els.slice(0, n).map(el =>
        (el.textContent?.match(/₹[0-9,]+/) ?? [''])[0]), count)).map(rupees).filter(p => p > 0);
}

async function skipIfChallenged(page: Page) {
    const title = await page.title();
    test.skip(/are you a human|access denied|captcha|503/i.test(title) || await page.locator('iframe[src*="captcha"]').count() > 0,
        `Flipkart refused the automated client ("${title}") - not a site outage`);
}

async function search(page: Page) {
    await page.goto(BASE_URL);
    await skipIfChallenged(page);
    // A login prompt opens over the home page for new visitors; a guest closes it.
    const close = page.getByRole('button', { name: '✕' });
    if (await close.isVisible({ timeout: 3000 }).catch(() => false)) await close.click();

    const box = page.locator('input[name="q"]').first();
    await box.fill(TERM);
    await box.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=/);
    await skipIfChallenged(page);
    await expect(cards(page).first()).toBeVisible();
}

test('search results are relevant and priced', async ({ page }) => {
    await search(page);
    await expect(page).toHaveTitle(new RegExp(TERM, 'i'));

    const names = await cards(page).evaluateAll(els => els.map(el =>
        el.querySelector('a[title]')?.getAttribute('title') ?? el.textContent ?? ''));
    expect(names.length).toBeGreaterThanOrEqual(10);
    const relevant = names.filter(n => new RegExp(KEYWORD, 'i').test(n)).length;
    expect(relevant / names.length, `only ${relevant}/${names.length} results mention "${KEYWORD}"`)
        .toBeGreaterThanOrEqual(0.8);

    const prices = await cardPrices(page);
    expect(prices.length).toBeGreaterThan(5);
});

test('price sort is applied, kept in the URL, and orders the results', async ({ page }) => {
    await search(page);
    await page.getByText('Price -- Low to High', { exact: true }).click();
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect.poll(async () => {
        const prices = await cardPrices(page);
        return prices.length > 5 && prices.every((p, i) => i === 0 || prices[i - 1] <= p);
    }, { message: 'results are not in ascending price order' }).toBe(true);

    // The sort lives in the URL, so a shared or reloaded link shows the same order.
    await page.reload();
    await skipIfChallenged(page);
    const reloaded = await cardPrices(page);
    expect(reloaded.every((p, i) => i === 0 || reloaded[i - 1] <= p), `after reload: ${reloaded.join(', ')}`).toBe(true);
});

test('the product page shows the price it publishes to search engines', async ({ page }) => {
    await search(page);
    const href = await cards(page).first().locator('a[href*="/p/"]').first().getAttribute('href');
    await page.goto(new URL(href!, BASE_URL).href);
    await skipIfChallenged(page);
    await expect(page.locator('h1').first()).toBeVisible();

    // The schema.org Product block is what Google shows in results; a page showing one price while
    // telling search engines another is a real, and costly, class of bug.
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const product = blocks.flatMap(b => [JSON.parse(b)].flat()).find(x => x['@type'] === 'Product');
    expect(product, 'no schema.org Product data on the page').toBeTruthy();
    const price = Number(product.offers.price);
    expect(product.offers.priceCurrency).toBe('INR');
    expect(price).toBeGreaterThan(0);

    const shown = `₹${price.toLocaleString('en-IN')}`;
    await expect(page.getByText(shown, { exact: true }).first(), `page does not show ${shown}`).toBeVisible();
    // The visible title is truncated with "...more"; it must still start like the published name.
    const heading = (await page.locator('h1').first().innerText()).replace(/\.\.\.more$/, '').trim();
    expect(product.name.startsWith(heading.slice(0, 30))).toBe(true);
});
