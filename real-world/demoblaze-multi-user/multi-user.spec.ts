import { test, expect, Browser, Page, Dialog } from '@playwright/test';

/*
 * Two shoppers at once on Demoblaze, each in an isolated browser context: real accounts (created
 * fresh for every run), carts kept on the server per account, and the account rules a login form
 * has to enforce. A cart has to follow its owner to a new device and never leak to anyone else.
 */
const BASE_URL = 'https://www.demoblaze.com';
const RUN = Date.now().toString(36);
const PASSWORD = process.env.SHOPPER_PASSWORD ?? `Asm-${RUN}-pw`;

// See demoblaze-purchase/purchase.spec.ts: a small /dev/shm on the check agents, and product photos
// that starve the browser there. Neither is part of what this checks.
test.use({ launchOptions: { args: ['--disable-dev-shm-usage'] } });
test.describe.configure({ timeout: 90000 });

const CART_TIMEOUT = 15000;

async function nextAlert(page: Page, action: () => Promise<unknown>): Promise<string> {
    const message = new Promise<string>(resolve => page.once('dialog', (d: Dialog) => {
        resolve(d.message());
        void d.accept();
    }));
    await action();
    return message;
}

async function newShopper(browser: Browser) {
    const context = await browser.newContext();
    await context.route(/\.(png|jpe?g|webp|gif)(\?|$)/, route => route.abort());
    const page = await context.newPage();
    await page.goto(BASE_URL);
    return page;
}

async function signUp(page: Page, username: string, password: string) {
    // From a fresh page: the sign-up modal does not reopen cleanly after a previous attempt.
    await page.goto(BASE_URL);
    await page.locator('#signin2').click();
    const modal = page.locator('#signInModal');
    await modal.locator('#sign-username').fill(username);
    await modal.locator('#sign-password').fill(password);
    const message = await nextAlert(page, () => modal.getByRole('button', { name: 'Sign up' }).click());
    await modal.getByRole('button', { name: 'Close' }).click().catch(() => { /* already closed */ });
    return message;
}

async function logIn(page: Page, username: string, password: string) {
    await page.locator('#login2').click();
    const modal = page.locator('#logInModal');
    await modal.locator('#loginusername').fill(username);
    await modal.locator('#loginpassword').fill(password);
    await modal.getByRole('button', { name: 'Log in' }).click();
}

async function addToCart(page: Page, title: string) {
    await page.goto(BASE_URL);
    await page.getByRole('link', { name: title, exact: true }).click();
    await expect(page.locator('.name')).toHaveText(title);
    const added = page.waitForResponse(r => r.url().endsWith('/addtocart') && r.ok());
    // Logged in, the store says "Product added." with a full stop; as a guest, without one.
    expect(await nextAlert(page, () => page.getByRole('link', { name: 'Add to cart' }).click())).toMatch(/^Product added\.?$/);
    await added;
}

async function cartTitles(page: Page) {
    const cart = page.waitForResponse(r => r.url().endsWith('/viewcart') && r.ok());
    await page.goto(`${BASE_URL}/cart.html`);
    const count = ((await (await cart).json()).Items as unknown[]).length;
    await expect(page.locator('#tbodyid tr')).toHaveCount(count, { timeout: CART_TIMEOUT });
    return page.locator('#tbodyid tr td:nth-child(2)').allInnerTexts();
}

test('two shoppers keep separate carts that follow them to a new device', async ({ browser }) => {
    const alice = { name: `asm-alice-${RUN}`, page: await newShopper(browser) };
    const bob = { name: `asm-bob-${RUN}`, page: await newShopper(browser) };

    for (const shopper of [alice, bob]) {
        await test.step(`${shopper.name} signs up and logs in`, async () => {
            expect(await signUp(shopper.page, shopper.name, PASSWORD)).toBe('Sign up successful.');
            await logIn(shopper.page, shopper.name, PASSWORD);
            await expect(shopper.page.locator('#nameofuser')).toHaveText(`Welcome ${shopper.name}`);
        });
    }

    await test.step('each adds a different product', async () => {
        await addToCart(alice.page, 'Samsung galaxy s6');
        await addToCart(bob.page, 'Nokia lumia 1520');
        await addToCart(bob.page, 'Nexus 6');
    });

    await test.step('neither sees the other\'s cart', async () => {
        expect(await cartTitles(alice.page)).toEqual(['Samsung galaxy s6']);
        expect((await cartTitles(bob.page)).sort()).toEqual(['Nexus 6', 'Nokia lumia 1520']);
    });

    await test.step('alice\'s cart follows her to a new device', async () => {
        const laptop = await newShopper(browser);
        // Before logging in, the new device has a guest cart of its own.
        expect(await cartTitles(laptop)).toEqual([]);
        await laptop.goto(BASE_URL);
        await logIn(laptop, alice.name, PASSWORD);
        await expect(laptop.locator('#nameofuser')).toHaveText(`Welcome ${alice.name}`);
        expect(await cartTitles(laptop)).toEqual(['Samsung galaxy s6']);
        await laptop.context().close();
    });

    await test.step('logging out ends the session', async () => {
        await bob.page.goto(BASE_URL);
        await bob.page.locator('#logout2').click();
        await expect(bob.page.locator('#login2')).toBeVisible();
        await expect(bob.page.locator('#nameofuser')).toBeHidden();
        // Bob's items stay with his account, not with the browser he left.
        expect(await cartTitles(bob.page)).toEqual([]);
    });

    await alice.page.context().close();
    await bob.page.context().close();
});

test('account rules: one account per name, and logins are checked', async ({ browser }) => {
    const page = await newShopper(browser);
    const name = `asm-carol-${RUN}`;

    expect(await signUp(page, name, PASSWORD)).toBe('Sign up successful.');
    expect(await signUp(page, name, 'another-password')).toBe('This user already exist.');

    await page.goto(BASE_URL);
    expect(await nextAlert(page, () => logIn(page, name, 'wrong-password'))).toBe('Wrong password.');
    await page.goto(BASE_URL);
    expect(await nextAlert(page, () => logIn(page, `asm-nobody-${RUN}`, PASSWORD))).toBe('User does not exist.');
    await expect(page.locator('#nameofuser')).toBeHidden();

    // The right password still works after the failed attempts.
    await page.goto(BASE_URL);
    await logIn(page, name, PASSWORD);
    await expect(page.locator('#nameofuser')).toHaveText(`Welcome ${name}`);
    await page.context().close();
});
