import {expect, test} from '@playwright/test';

// The no-webServer half of the encryption samples: same flow as samples/pw-env.spec.ts, but the
// login page comes from a route handler rather than samples/pw-env-server.js. Nothing is spawned
// and no port is bound, which is the shape an ASM agent actually runs a check in.
const LOGIN_PAGE = '<form><input id="email"><input id="password" type="password"><button id="submit">Go</button></form>';

test('login test without a web server', async ({page}) => {
    await page.route('**/login', async (route) => {
        await route.fulfill({contentType: 'text/html', body: LOGIN_PAGE});
    });

    // Relative, so it only resolves if baseURL came through from the (decrypted) config.
    await page.goto('/login');
    await page.fill('#email', process.env.USER_EMAIL!);
    await page.fill('#password', process.env.USER_PASS!);

    // Asserted rather than assumed: this is what fails the run if the config never decrypted and
    // the credentials arrived empty.
    await expect(page.locator('#email')).toHaveValue(process.env.USER_EMAIL!);
    await expect(page.locator('#password')).toHaveValue(process.env.USER_PASS!);

    await page.click('#submit');
});
