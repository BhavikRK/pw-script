/**
 * Playwright Test, --testTimeout: each test on its own.
 * An 8s test with --testTimeout 3000 -> "Test timeout of 3000ms exceeded."
 */
import {test} from "@playwright/test";

test("takes 8s", async ({page}) => {
    await page.waitForTimeout(8000);
});
