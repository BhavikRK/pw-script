import { test } from '@playwright/test';

test('login test', async ({ page }) => {
    await page.goto('/login'); // Uses baseURL from config
    await page.fill('#email', process.env.USER_EMAIL!);
    await page.fill('#password', process.env.USER_PASS!);
    await page.click('#submit');
});