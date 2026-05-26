import { expect, Page } from "@playwright/test";

export default async function example(page: Page) {

    // Open site
    await page.goto(
        "https://caba.betsson.bet.ar/?source=apica",
        {
            waitUntil: "networkidle"
        }
    );

    // Wait for header
    await page.waitForSelector(
        "site-header-version-manager"
    );

    // Login button inside shadow dom
    const loginButton = page.locator(`
        router-link-v2[data-test-id="login-button"]
        >> fds-button_control
        >> fds-button
        >> button[data-test-id="btn-1-button"]
    `);

    await loginButton.waitFor({
        state: 'visible',
        timeout: 60000
    });

    await expect(loginButton).toBeVisible();

    await loginButton.click();

    // Email input
    const emailInput = page.locator(`
        site-root_default
        >> fds-dialog
        >> account-login_fabric_wrapper
        >> account-login-fabric
        >> #email-input
    `);

    await emailInput.waitFor({
        state: 'visible',
        timeout: 60000
    });

    await expect(emailInput).toBeVisible();

    await emailInput.fill(
        "noc@betssongroup.com"
    );

    // Password input
    const passwordInput = page.locator(`
        site-root_default
        >> fds-dialog
        >> account-login_fabric_wrapper
        >> account-login-fabric
        >> #password-input
    `);

    await expect(passwordInput).toBeVisible();

    await passwordInput.fill(
        "n0cT35tAcc0unt!!"
    );

    // Submit login
    const submitButton = page.locator(`
        site-root_default
        >> fds-dialog
        >> account-login_fabric_wrapper
        >> account-login-fabric
        >> fds-button_control
        >> fds-button
    `).last();

    await expect(submitButton).toBeVisible();

    await submitButton.click();

    // Wait after login
    await page.waitForTimeout(10000);
}