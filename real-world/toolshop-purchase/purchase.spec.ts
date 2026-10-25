import { test, expect, Page } from '@playwright/test';

/*
 * End-to-end shopping on Practice Software Testing's Toolshop, a public demo shop with a real REST
 * API behind it. The account is the shop's published demo customer; point the check at another one
 * with --envVars TOOLSHOP_EMAIL=... TOOLSHOP_PASSWORD=...
 *
 * Prices are read from the page rather than hardcoded, so the totals the shop computes are checked
 * against our own arithmetic instead of against a snapshot that goes stale.
 */
const BASE_URL = 'https://practicesoftwaretesting.com';
const EMAIL = process.env.TOOLSHOP_EMAIL ?? 'customer@practicesoftwaretesting.com';
const PASSWORD = process.env.TOOLSHOP_PASSWORD ?? 'welcome01';

const money = (text: string) => Number(text.replace(/[^0-9.]/g, ''));
const cents = (value: number) => Math.round(value * 100);

async function login(page: Page) {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.locator('[data-test="email"]').fill(EMAIL);
    await page.locator('[data-test="password"]').fill(PASSWORD);
    await page.locator('[data-test="login-submit"]').click();
    await expect(page.locator('[data-test="page-title"]')).toHaveText('My account');
}

async function search(page: Page, term: string) {
    await page.goto(BASE_URL);
    await page.locator('[data-test="search-query"]').fill(term);
    await page.locator('[data-test="search-submit"]').click();
    await expect(page.locator('[data-test="search-term"]')).toHaveText(term);
    // The caption updates before the results do; this marker appears once they are replaced.
    await expect(page.locator('[data-test="search_completed"]')).toBeVisible();
}

/** Opens a product from the search results by its exact name and returns its unit price. */
async function openProduct(page: Page, name: string) {
    await page.locator('a.card').filter({ has: page.getByText(name, { exact: true }) }).click();
    await expect(page.locator('[data-test="product-name"]')).toHaveText(name);
    return money(await page.locator('[data-test="unit-price"]').innerText());
}

async function addToCart(page: Page, quantity: number) {
    await page.locator('[data-test="quantity"]').fill(String(quantity));
    await page.locator('[data-test="add-to-cart"]').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Product added to shopping cart.' })).toBeVisible();
}

test.describe('catalog', () => {
    test('search results match the term and the result count', async ({ page }) => {
        await search(page, 'pliers');

        const names = page.locator('[data-test="product-name"]');
        await expect(names.first()).toBeVisible();
        for (const name of await names.allInnerTexts()) {
            expect(name).toMatch(/pliers/i);
        }
        await expect(page.locator('[data-test="search-result-count"]'))
            .toHaveText(`${await names.count()} products found for 'pliers'`);
    });

    test('sorting by price orders every card on the page', async ({ page }) => {
        await page.goto(BASE_URL);
        await expect(page.locator('[data-test="product-price"]').first()).toBeVisible();

        const prices = async () =>
            (await page.locator('[data-test="product-price"]').allInnerTexts()).map(money);

        await page.locator('[data-test="sort"]').selectOption({ label: 'Price (Low - High)' });
        // The list re-renders from a new API call, so poll until the order settles.
        await expect.poll(async () => {
            const p = await prices();
            return p.length > 1 && p.every((v, i) => i === 0 || p[i - 1] <= v);
        }).toBe(true);

        await page.locator('[data-test="sort"]').selectOption({ label: 'Price (High - Low)' });
        await expect.poll(async () => {
            const p = await prices();
            return p.length > 1 && p.every((v, i) => i === 0 || p[i - 1] >= v);
        }).toBe(true);
    });

    test('an out-of-stock product cannot be added to the cart', async ({ page }) => {
        await search(page, 'pliers');
        await openProduct(page, 'Long Nose Pliers');
        await expect(page.locator('[data-test="out-of-stock"]')).toBeVisible();
        await expect(page.locator('[data-test="add-to-cart"]')).toBeDisabled();
    });
});

test('customer buys two products and the invoice matches the cart', async ({ page }) => {
    const cart: { name: string; price: number; quantity: number }[] = [];

    await test.step('log in', () => login(page));

    await test.step('add 2 x Combination Pliers', async () => {
        await search(page, 'pliers');
        const price = await openProduct(page, 'Combination Pliers');
        await addToCart(page, 2);
        cart.push({ name: 'Combination Pliers', price, quantity: 2 });
    });

    await test.step('add 1 x Claw Hammer', async () => {
        await search(page, 'hammer');
        const price = await openProduct(page, 'Claw Hammer');
        await addToCart(page, 1);
        cart.push({ name: 'Claw Hammer', price, quantity: 1 });
        await expect(page.locator('[data-test="cart-quantity"]')).toHaveText('3');
    });

    const expectedTotal = cart.reduce((sum, line) => sum + cents(line.price) * line.quantity, 0) / 100;

    await test.step('cart lines and total add up', async () => {
        await page.locator('[data-test="nav-cart"]').click();
        for (const line of cart) {
            const row = page.locator('tr').filter({ has: page.getByText(line.name, { exact: true }) });
            await expect(row.locator('[data-test="product-quantity"]')).toHaveValue(String(line.quantity));
            expect(money(await row.locator('[data-test="line-price"]').innerText()))
                .toBe((cents(line.price) * line.quantity) / 100);
        }
        expect(money(await page.locator('[data-test="cart-total"]').innerText())).toBe(expectedTotal);
    });

    await test.step('billing address from the postcode lookup', async () => {
        await page.locator('[data-test="proceed-1"]').click();
        await expect(page.getByText('you are already logged in')).toBeVisible();
        await page.locator('[data-test="proceed-2"]').click();

        // The shop fills street, city and state from country + postcode + house number, and the
        // invoice is refused (422, silently in the UI) if they disagree, so let the lookup do it
        // and check the form shows what the API returned.
        const lookup = page.waitForResponse(r =>
            r.url().includes('/postcode-lookup') && r.url().includes('house_number=1') && r.ok());
        await page.locator('[data-test="country"]').selectOption('NL');
        await page.locator('[data-test="postal_code"]').fill('1012JS');
        await page.locator('[data-test="house_number"]').fill('1');
        await page.locator('[data-test="house_number"]').press('Tab');
        const address = await (await lookup).json();
        await expect(page.locator('[data-test="street"]')).toHaveValue(address.street);
        await expect(page.locator('[data-test="city"]')).toHaveValue(address.city);
        await expect(page.locator('[data-test="state"]')).toHaveValue(address.state);
        await page.locator('[data-test="proceed-3"]').click();
    });

    let invoiceNumber = '';
    await test.step('pay cash on delivery', async () => {
        await page.locator('[data-test="payment-method"]').selectOption({ label: 'Cash on Delivery' });
        const finish = page.locator('[data-test="finish"]');
        await finish.click();
        await expect(page.locator('[data-test="payment-success-message"]')).toHaveText('Payment was successful');
        // The same button turns into "Confirm" once the payment is accepted.
        await expect(finish).toHaveText('Confirm');
        await finish.click();
        const confirmation = page.locator('#order-confirmation');
        await expect(confirmation).toContainText('Thanks for your order!', { timeout: 15000 });
        invoiceNumber = (await confirmation.innerText()).match(/INV-\d+/)![0];
        await expect(page.locator('[data-test="cart-quantity"]')).toBeHidden();
    });

    await test.step('invoice is listed with the cart total', async () => {
        await page.goto(`${BASE_URL}/account/invoices`);
        const row = page.locator('tr').filter({ hasText: invoiceNumber });
        await expect(row).toBeVisible();
        expect(money(await row.locator('td').filter({ hasText: '$' }).innerText())).toBe(expectedTotal);
    });
});

test('cart quantity changes recompute totals and survive a reload', async ({ page }) => {
    await search(page, 'pliers');
    const price = await openProduct(page, 'Slip Joint Pliers');
    await addToCart(page, 1);
    await page.locator('[data-test="nav-cart"]').click();

    const quantity = page.locator('[data-test="product-quantity"]');
    await quantity.fill('4');
    await quantity.press('Tab');
    await expect.poll(async () => money(await page.locator('[data-test="cart-total"]').innerText()))
        .toBe((cents(price) * 4) / 100);
    await expect(page.locator('[data-test="cart-quantity"]')).toHaveText('4');

    // The cart lives on the server, keyed by an id the browser keeps, so a reload must not lose it.
    await page.reload();
    await expect(quantity).toHaveValue('4');
    expect(money(await page.locator('[data-test="line-price"]').innerText())).toBe((cents(price) * 4) / 100);
});

test('a limited product is capped at one per cart', async ({ page }) => {
    await search(page, 'hammer');
    const price = await openProduct(page, 'Thor Hammer');
    await addToCart(page, 1);
    await page.locator('[data-test="nav-cart"]').click();

    const quantity = page.locator('[data-test="product-quantity"]');
    await quantity.fill('3');
    await quantity.press('Tab');
    await expect(page.getByRole('alert').filter({ hasText: 'You can only have one Thor Hammer in the cart.' }))
        .toBeVisible();
    // The rejected change must not be charged: the total still holds a single hammer.
    expect(money(await page.locator('[data-test="cart-total"]').innerText())).toBe(price);
});
