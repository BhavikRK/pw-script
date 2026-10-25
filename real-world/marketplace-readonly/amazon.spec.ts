import { test, expect, Locator, Page } from '@playwright/test';

/*
 * READ-ONLY, MANUAL-RUN SAMPLE. Do not schedule this as a recurring check.
 *
 * Amazon's Conditions of Use do not allow automated access, and the site answers bots with a 503
 * page, a CAPTCHA, or a "continue shopping" gate. This sample therefore:
 *   - never logs in, never checks out, and leaves the guest cart as it found it;
 *   - clicks through the "continue shopping" gate once, like a person would;
 *   - SKIPS (does not fail) when it is served a CAPTCHA or a 503, because that is the site
 *     refusing an automated client, not the site being down.
 *
 * Results, prices and products change constantly, so nothing is hardcoded but the search term.
 */
const BASE_URL = 'https://www.amazon.in';
const TERM = process.env.SEARCH_TERM ?? 'wireless mouse';
const KEYWORD = process.env.SEARCH_KEYWORD ?? 'mouse';

test.use({ locale: 'en-IN', viewport: { width: 1366, height: 900 } });

const rupees = (text: string) => Number(text.replace(/[^0-9.]/g, ''));

/**
 * Waits until the page shows `ready`, clicking through the soft "continue shopping" gate on the way,
 * and skips the test when the site refuses automated clients outright. The gate can render after
 * the page has loaded, so this waits for whichever of the three appears rather than checking once.
 */
async function passBotChecks(page: Page, ready: Locator) {
    const gate = page.getByRole('button', { name: 'Continue shopping' });
    const captcha = page.locator('form[action*="validateCaptcha"]');
    for (let attempt = 0; attempt < 3; attempt++) {
        await expect(ready.or(gate).or(captcha).first()).toBeVisible({ timeout: 20000 })
            .catch(() => { /* judged by the title below */ });
        const title = await page.title();
        test.skip(await captcha.isVisible() || /503|Service Unavailable|Robot Check/i.test(title),
            `Amazon refused the automated client ("${title}") - not a site outage`);
        if (!(await gate.isVisible())) break;
        await gate.click();
        await page.waitForLoadState('domcontentloaded');
    }
    await expect(ready.first()).toBeVisible();
}

const results = (page: Page) => page.locator('[data-component-type="s-search-result"]');
/** Organic results with a price: sponsored slots are placed by bidding, not by the sort order. */
const organic = (page: Page) => results(page)
    .filter({ has: page.locator('.a-price') })
    .filter({ hasNot: page.getByText('Sponsored', { exact: true }) });

async function search(page: Page) {
    await page.goto(`${BASE_URL}/s?k=${encodeURIComponent(TERM)}`);
    await passBotChecks(page, results(page));
}

test('search results are relevant and priced', async ({ page }) => {
    await search(page);
    await expect(page).toHaveTitle(new RegExp(TERM, 'i'));

    const titles = await results(page).locator('h2').allInnerTexts();
    expect(titles.length).toBeGreaterThanOrEqual(10);
    // Marketplaces mix in accessories and look-alikes; most results, not all, must match.
    const relevant = titles.filter(t => new RegExp(KEYWORD, 'i').test(t)).length;
    expect(relevant / titles.length, `only ${relevant}/${titles.length} titles mention "${KEYWORD}"`)
        .toBeGreaterThanOrEqual(0.8);

    const prices = (await organic(page).locator('.a-price:not(.a-text-price) .a-offscreen').allTextContents()).map(rupees);
    expect(prices.length).toBeGreaterThan(0);
    for (const price of prices) expect(price).toBeGreaterThan(0);
});

test('sorting by price puts the cheapest organic results first', async ({ page }) => {
    await search(page);
    await page.locator('#s-result-sort-select').selectOption('price-asc-rank', { force: true });
    await expect(page).toHaveURL(/s=price-asc-rank/);
    await passBotChecks(page, results(page));

    const prices = (await organic(page).evaluateAll(cards => cards.slice(0, 15).map(card =>
        card.querySelector('.a-price:not(.a-text-price) .a-offscreen')?.textContent ?? '')))
        .map(rupees).filter(p => p > 0);
    expect(prices.length).toBeGreaterThan(3);
    // Amazon sorts by the lowest offer, which a variant or a deal can undercut on the card; allow a
    // few cards out of place but not a list that is plainly unsorted.
    const outOfOrder = prices.filter((p, i) => i > 0 && p < prices[i - 1]).length;
    expect(outOfOrder, `prices after sorting: ${prices.join(', ')}`).toBeLessThanOrEqual(2);
});

test('guest can add a product to the cart and remove it again', async ({ page: searchPage }) => {
    let page = searchPage;
    await search(page);

    // Open the product the way a shopper does, by clicking it: a cold visit to a product URL with
    // no referrer is what Amazon most often meets with a CAPTCHA.
    const card = organic(page).first();
    const asin = await card.getAttribute('data-asin');
    expect(asin).toMatch(/^[A-Z0-9]{10}$/);
    const opened = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await card.locator('a:has(h2)').first().click();
    // Some layouts open products in a new tab; carry on in whichever tab shows it.
    page = (await opened) ?? page;
    await expect(page).toHaveURL(new RegExp(asin!));
    await passBotChecks(page, page.locator('#productTitle'));

    const title = (await page.locator('#productTitle').innerText()).trim();
    expect(title.length).toBeGreaterThan(5);
    await expect(page.locator('#availability')).toContainText(/in stock/i);
    const addToCart = page.locator('#add-to-cart-button').first();
    test.skip(!(await addToCart.isVisible()), 'this listing has no Add to cart button (sold by other sellers only)');

    const cartCount = page.locator('#nav-cart-count');
    const before = Number(await cartCount.innerText());

    await addToCart.click();
    await passBotChecks(page, page.locator('#NATC_SMART_WAGON_CONF_MSG_SUCCESS'));
    await expect(page.locator('#NATC_SMART_WAGON_CONF_MSG_SUCCESS')).toContainText('Added to cart');
    await expect(cartCount).toHaveText(String(before + 1));

    await page.goto(`${BASE_URL}/gp/cart/view.html`);
    const line = page.locator('.sc-list-item').filter({ hasText: title.slice(0, 40) });
    await passBotChecks(page, line);

    // Leave the cart as it was found.
    await line.locator('input[value="Delete"]').click();
    await expect(page.locator('.sc-list-item-removed-msg')).toContainText('was removed from Shopping Cart');
    await expect(cartCount).toHaveText(String(before));
});
