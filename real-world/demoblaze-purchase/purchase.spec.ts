import { test, expect, Page, Dialog } from '@playwright/test';

/*
 * End-to-end shopping on Demoblaze, a public demo store with a real backend: the catalog, the cart
 * and orders all go through api.demoblaze.com. The cart is kept on the server against a cookie, so
 * each test starts from an empty one in its own browser context.
 *
 * Prices are read from the page, never hardcoded, so the totals the store computes are checked
 * against our own arithmetic rather than a snapshot that goes stale.
 */
const BASE_URL = 'https://www.demoblaze.com';

const money = (text: string) => Number(text.replace(/[^0-9.]/g, ''));

/**
 * Demoblaze reports with window.alert(); this returns the text of the next one. The alert is
 * accepted from the event handler, because some alerts fire inside the click itself and the click
 * cannot finish until the alert is gone.
 */
async function nextAlert(page: Page, action: () => Promise<unknown>): Promise<string> {
    const message = new Promise<string>(resolve => page.once('dialog', (d: Dialog) => {
        resolve(d.message());
        void d.accept();
    }));
    await action();
    return message;
}

/** Cart rows are drawn one at a time, each after its own /view call, so allow for a few of them. */
const CART_TIMEOUT = 15000;

const cards = (page: Page) => page.locator('#tbodyid .card');

async function openCategory(page: Page, name: 'Phones' | 'Laptops' | 'Monitors') {
    const listed = page.waitForResponse(r => r.url().endsWith('/bycat') && r.ok());
    await page.getByRole('link', { name }).click();
    const items = (await (await listed).json()).Items as { title: string; cat: string }[];
    // The grid is redrawn from that response; wait until it shows exactly those items.
    await expect(cards(page).locator('.card-title')).toHaveText(items.map(i => i.title));
    return items;
}

/** Opens a product from the current grid, adds it to the cart, and returns its price. */
async function addToCart(page: Page, title: string) {
    const card = cards(page).filter({ has: page.getByRole('link', { name: title, exact: true }) });
    const listed = money(await card.locator('h5').innerText());
    await card.getByRole('link', { name: title, exact: true }).click();
    await expect(page.locator('.name')).toHaveText(title);
    // The product page must agree with the catalog it was opened from.
    expect(money(await page.locator('.price-container').innerText())).toBe(listed);
    expect(await nextAlert(page, () => page.getByRole('link', { name: 'Add to cart' }).click())).toBe('Product added');
    await page.goto(BASE_URL);
    return listed;
}

async function openCart(page: Page, expectedLines: number) {
    await page.locator('#cartur').click();
    await expect(page.locator('#tbodyid tr')).toHaveCount(expectedLines, { timeout: CART_TIMEOUT });
}

// The store's API answers in about a second per call and a cart of three costs a dozen calls.
test.describe.configure({ timeout: 60000 });

test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(cards(page).first()).toBeVisible();
});

test('categories show only their own products', async ({ page }) => {
    const phones = await openCategory(page, 'Phones');
    const laptops = await openCategory(page, 'Laptops');
    const monitors = await openCategory(page, 'Monitors');

    expect(phones.every(i => i.cat === 'phone')).toBe(true);
    expect(laptops.every(i => i.cat === 'notebook')).toBe(true);
    expect(monitors.every(i => i.cat === 'monitor')).toBe(true);
    // No product sits in two categories.
    const titles = [...phones, ...laptops, ...monitors].map(i => i.title);
    expect(new Set(titles).size).toBe(titles.length);
});

test('cart total is the sum of its lines and follows a deletion', async ({ page }) => {
    await openCategory(page, 'Phones');
    const phone = await addToCart(page, 'Samsung galaxy s6');
    await openCategory(page, 'Laptops');
    const laptop = await addToCart(page, 'MacBook air');
    await openCategory(page, 'Monitors');
    const monitor = await addToCart(page, 'Apple monitor 24');

    await openCart(page, 3);
    const linePrices = (await page.locator('#tbodyid tr td:nth-child(3)').allInnerTexts()).map(money);
    expect(linePrices.sort()).toEqual([phone, laptop, monitor].sort());
    await expect(page.locator('#totalp')).toHaveText(String(phone + laptop + monitor), { timeout: CART_TIMEOUT });

    const removed = page.waitForResponse(r => r.url().endsWith('/deleteitem') && r.ok());
    await page.locator('#tbodyid tr').filter({ hasText: 'MacBook air' }).getByRole('link', { name: 'Delete' }).click();
    await removed;
    await expect(page.locator('#tbodyid tr')).toHaveCount(2, { timeout: CART_TIMEOUT });
    await expect(page.locator('#totalp')).toHaveText(String(phone + monitor), { timeout: CART_TIMEOUT });

    // The cart is server-side: a reload must show the same two lines.
    await page.reload();
    await expect(page.locator('#tbodyid tr')).toHaveCount(2, { timeout: CART_TIMEOUT });
    await expect(page.locator('#totalp')).toHaveText(String(phone + monitor), { timeout: CART_TIMEOUT });
});

test('an order needs a name and a card, then confirms the cart total', async ({ page }) => {
    await openCategory(page, 'Laptops');
    const price = await addToCart(page, 'Sony vaio i5');
    await openCart(page, 1);
    await expect(page.locator('#totalp')).toHaveText(String(price), { timeout: CART_TIMEOUT });

    await page.getByRole('button', { name: 'Place Order' }).click();
    const order = page.locator('#orderModal');
    await expect(order.locator('#totalm')).toHaveText(`Total: ${price}`);

    // Validation: nothing is sent to the API until the required fields are filled.
    let ordered = false;
    page.on('request', r => { if (r.url().endsWith('/deletecart')) ordered = true; });
    expect(await nextAlert(page, () => order.getByRole('button', { name: 'Purchase' }).click()))
        .toBe('Please fill out Name and Creditcard.');
    expect(ordered).toBe(false);

    await order.locator('#name').fill('Asm Check');
    await order.locator('#country').fill('Sweden');
    await order.locator('#city').fill('Stockholm');
    await order.locator('#card').fill('4111111111111111');
    await order.locator('#month').fill('12');
    await order.locator('#year').fill('2030');
    const emptied = page.waitForResponse(r => r.url().endsWith('/deletecart'));
    await order.getByRole('button', { name: 'Purchase' }).click();

    const confirmation = page.locator('.sweet-alert');
    await expect(confirmation.locator('h2')).toHaveText('Thank you for your purchase!');
    const receipt = await confirmation.locator('p').innerText();
    expect(receipt).toMatch(/Id: \d+/);
    expect(receipt).toContain(`Amount: ${price} USD`);
    expect(receipt).toContain('Card Number: 4111111111111111');
    expect(receipt).toContain('Name: Asm Check');

    // Placing the order empties the cart on the server; let that call finish before looking.
    expect((await emptied).ok()).toBe(true);
    const cart = page.waitForResponse(r => r.url().endsWith('/viewcart') && r.ok());
    await page.goto(`${BASE_URL}/cart.html`);
    expect((await (await cart).json()).Items).toEqual([]);
    await expect(page.locator('#tbodyid tr')).toHaveCount(0);
});
