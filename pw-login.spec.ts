import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://ascent-support.apica.io/login';
const AUTH_ERROR_TEXT = process.env.AUTH_ERROR_TEXT ?? 'Invalid username or password';
const VALIDATION_EMAIL_ERROR = process.env.VALIDATION_EMAIL_ERROR ?? 'Please enter a valid email';
const FORGOT_PASSWORD_SUCCESS_TEXT =
    process.env.FORGOT_PASSWORD_SUCCESS_TEXT ??
    'If an account is associated with this email, a verification code has been sent to it.';

const selectors = {
    username: /email id/i,
    password: /password/i,
    submit: /^login$/i,
    forgotPasswordLink: /forgot password/i,
    forgotPasswordSubmit: /send email/i,
};

function usernameInput(page: Page) {
    return page.getByRole('textbox', { name: selectors.username }).first();
}

function passwordInput(page: Page) {
    return page.getByRole('textbox', { name: selectors.password }).first();
}

function loginButton(page: Page) {
    return page.getByRole('button', { name: selectors.submit }).first();
}

function forgotPasswordLink(page: Page) {
    return page.getByRole('link', { name: selectors.forgotPasswordLink }).first();
}

function forgotPasswordEmailInput(page: Page) {
    return page.getByRole('textbox', { name: selectors.username }).first();
}

function forgotPasswordSubmitButton(page: Page) {
    return page.getByRole('button', { name: selectors.forgotPasswordSubmit }).first();
}

async function gotoLogin(page: Page) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await expect(usernameInput(page)).toBeVisible();
    await expect(passwordInput(page)).toBeVisible();
}

async function fillLogin(page: Page, username: string, password: string) {
    const usernameField = usernameInput(page);
    const passwordField = passwordInput(page);

    await usernameField.fill('');
    await passwordField.fill('');

    if (username) {
        await usernameField.fill(username);
    }

    if (password) {
        await passwordField.fill(password);
    }
}

async function assertStillOnLogin(page: Page) {
    await expect(usernameInput(page)).toBeVisible();
    await expect(passwordInput(page)).toBeVisible();
    await expect(page).toHaveURL(/login|signin|auth/i);
}

async function openForgotPassword(page: Page) {
    const forgotLink = forgotPasswordLink(page);
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();
    await expect(page).toHaveURL(/forgot|reset/i);
    await expect(forgotPasswordEmailInput(page)).toBeVisible();
}

test.describe('Login page only coverage', () => {
    const invalidCredentialCases = [
        { username: 'wronguser@example.com', password: 'wrongpass123' },
        { username: 'another.fake.user@example.com', password: 'anotherWrongPass1' },
    ];

    for (const { username, password } of invalidCredentialCases) {
        test(`invalid credentials stay on login page: ${username}`, async ({ page }) => {
            await gotoLogin(page);
            await fillLogin(page, username, password);
            await loginButton(page).click();

            await expect(page.getByText(AUTH_ERROR_TEXT, { exact: true })).toBeVisible();
            await assertStillOnLogin(page);
        });
    }

    const submitStateCases = [
        { username: '', password: 'somepassword', enabled: false, label: 'password only' },
        { username: 'someone@example.com', password: '', enabled: false, label: 'username only' },
        { username: '', password: '', enabled: false, label: 'both empty' },
        { username: 'someone@example.com', password: 'somepassword', enabled: true, label: 'both present' },
    ];

    for (const { username, password, enabled, label } of submitStateCases) {
        test(`submit button state: ${label}`, async ({ page }) => {
            await gotoLogin(page);
            await fillLogin(page, username, password);

            const submitButton = loginButton(page);
            if (enabled) {
                await expect(submitButton).toBeEnabled();
            } else {
                await expect(submitButton).toBeDisabled();
            }
        });
    }

    const injectionCases = [
        "' OR '1'='1",
        '<script>alert(1)</script>',
    ];

    for (const payload of injectionCases) {
        test(`username payload is rejected client-side: ${payload}`, async ({ page }) => {
            let dialogSeen = false;

            page.on('dialog', async dialog => {
                dialogSeen = true;
                await dialog.dismiss();
            });

            await gotoLogin(page);
            await fillLogin(page, payload, 'wrongpass123');
            await loginButton(page).click();

            await expect(page.getByText(VALIDATION_EMAIL_ERROR, { exact: true })).toBeVisible();
            await expect(usernameInput(page)).toHaveAttribute('aria-invalid', 'true');
            await expect(dialogSeen).toBeFalsy();
            await assertStillOnLogin(page);
        });
    }

    test('forgot password link is visible and navigates to reset flow', async ({ page }) => {
        await gotoLogin(page);

        const forgotLink = forgotPasswordLink(page);
        await expect(forgotLink).toBeVisible();

        await forgotLink.click();

        await expect(page).toHaveURL(/forgot|reset/i);
        await expect(forgotPasswordEmailInput(page)).toBeVisible();
        await expect(forgotPasswordSubmitButton(page)).toBeVisible();
    });

    const forgotPasswordCases = [
        'nonexistent-user-xyz-999@example.com',
        'another-unregistered-address@example.com',
    ];

    for (const email of forgotPasswordCases) {
        test(`forgot password returns generic response: ${email}`, async ({ page }) => {
            await gotoLogin(page);
            await openForgotPassword(page);

            await forgotPasswordEmailInput(page).fill(email);
            await forgotPasswordSubmitButton(page).click();

            await expect(page.getByText(/^Verify code$/).first()).toBeVisible();
            await expect(page.getByRole('textbox').first()).toBeVisible();
            await expect(page.getByText(FORGOT_PASSWORD_SUCCESS_TEXT, { exact: true })).toBeVisible();
            await expect(page).toHaveURL(/forgot|reset/i);
        });
    }

    test('password field masks user input', async ({ page }) => {
        await gotoLogin(page);

        const passwordField = passwordInput(page);
        await passwordField.fill('SuperSecret123!');

        await expect(passwordField).toHaveAttribute('type', /password/i);
    });
});
