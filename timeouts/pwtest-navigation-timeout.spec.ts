/**
 * Playwright Test, --navigationTimeout: each navigation on its own (Playwright's use.navigationTimeout).
 * https://httpbin.org/delay/10 answers after 10s; with --navigationTimeout 3000 -> "page.goto: Timeout 3000ms exceeded."
 */
import {test} from "@playwright/test";

test("loads a slow page", async ({page}) => {
    await page.goto("https://httpbin.org/delay/10");
});
