import { test, expect, Browser, Page } from '@playwright/test';

/*
 * A support ticket handled by two people at once, each in an isolated browser context:
 * a customer files a message through the contact form, an admin finds it in the back office, moves
 * it to IN_PROGRESS and replies, and the customer then sees the reply on their own message page.
 *
 * Both accounts are Practice Software Testing's published demo users; override them with
 * --envVars CUSTOMER_EMAIL=... CUSTOMER_PASSWORD=... ADMIN_EMAIL=... ADMIN_PASSWORD=...
 *
 * The ticket text carries a run id, so the check finds its own ticket on a shared public instance
 * that other people are writing to at the same time.
 */
const BASE_URL = 'https://practicesoftwaretesting.com';
const CUSTOMER = {
    email: process.env.CUSTOMER_EMAIL ?? 'customer@practicesoftwaretesting.com',
    password: process.env.CUSTOMER_PASSWORD ?? 'welcome01',
};
const ADMIN = {
    email: process.env.ADMIN_EMAIL ?? 'admin@practicesoftwaretesting.com',
    password: process.env.ADMIN_PASSWORD ?? 'welcome01',
};

async function loggedInPage(browser: Browser, user: { email: string; password: string }): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/auth/login`);
    await page.locator('[data-test="email"]').fill(user.email);
    await page.locator('[data-test="password"]').fill(user.password);
    await page.locator('[data-test="login-submit"]').click();
    await expect(page.locator('[data-test="nav-menu"]')).toBeVisible();
    return page;
}

test('customer ticket is triaged and answered by an admin', async ({ browser }) => {
    const runId = `ASM-${Date.now()}`;
    const question = `[${runId}] My order has not arrived yet. Could you tell me when it will be shipped?`;
    const answer = `[${runId}] Thanks for reaching out - your order left our warehouse this morning.`;

    const customer = await test.step('customer logs in', () => loggedInPage(browser, CUSTOMER));
    const admin = await test.step('admin logs in', () => loggedInPage(browser, ADMIN));

    const messageId = await test.step('customer sends the ticket', async () => {
        await customer.goto(`${BASE_URL}/contact`);
        // A logged-in customer is not asked for name and email: the form knows who they are.
        await expect(customer.locator('[data-test="first-name"]')).toBeHidden();
        await customer.locator('[data-test="subject"]').selectOption({ label: 'Status of my order' });
        await customer.locator('[data-test="message"]').fill(question);

        const sent = customer.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST');
        await customer.locator('[data-test="contact-submit"]').click();
        const response = await sent;
        expect(response.status()).toBe(200);
        await expect(customer.getByRole('alert')).toHaveText('Thanks for your message! We will contact you shortly.');
        return (await response.json()).id as string;
    });

    await test.step('customer sees the ticket as NEW', async () => {
        await customer.goto(`${BASE_URL}/account/messages`);
        const row = customer.locator('tr').filter({ hasText: runId });
        await expect(row).toContainText('NEW');
    });

    await test.step('admin finds the ticket in the inbox', async () => {
        await admin.locator('[data-test="nav-menu"]').click();
        await admin.locator('[data-test="nav-admin-messages"]').click();
        await expect(admin.locator('[data-test="page-title"]')).toHaveText('Messages');
        const link = admin.locator(`[data-test="message-details-${messageId}"]`);
        await expect(admin.locator('tr').filter({ has: link })).toContainText('status-of-order');
        await link.click();
        await expect(admin.getByText(question)).toBeVisible();
    });

    await test.step('admin moves it to IN_PROGRESS and replies', async () => {
        const statusSaved = admin.waitForResponse(r => r.url().includes(`/messages/${messageId}/status`) && r.ok());
        await admin.locator('[data-test="status"]').selectOption('IN_PROGRESS');
        await statusSaved;

        await admin.locator('[data-test="message"]').fill(answer);
        await admin.locator('[data-test="reply-submit"]').click();
        await expect(admin.getByText(answer)).toBeVisible();
    });

    await test.step('customer reads the reply', async () => {
        await customer.goto(`${BASE_URL}/account/messages/${messageId}`);
        await expect(customer.getByText(question)).toBeVisible();
        await expect(customer.getByText(answer)).toBeVisible();

        await customer.goto(`${BASE_URL}/account/messages`);
        await expect(customer.locator('tr').filter({ hasText: runId })).toContainText('IN_PROGRESS');
    });

    await customer.context().close();
    await admin.context().close();
});

test('the contact form rejects an incomplete message from a guest', async ({ page }) => {
    await page.goto(`${BASE_URL}/contact`);
    await page.locator('[data-test="first-name"]').fill('Guest');
    await page.locator('[data-test="email"]').fill('not-an-email');
    await page.locator('[data-test="message"]').fill('Too short');
    await page.locator('[data-test="contact-submit"]').click();

    await expect(page.locator('[data-test="last-name-error"]')).toBeVisible();
    await expect(page.locator('[data-test="email-error"]')).toBeVisible();
    await expect(page.locator('[data-test="subject-error"]')).toBeVisible();
    await expect(page.locator('[data-test="message-error"]')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Thanks for your message' })).toHaveCount(0);
});
