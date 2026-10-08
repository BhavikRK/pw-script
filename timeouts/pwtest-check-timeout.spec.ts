/**
 * Playwright Test, --checkAttemptTimeout: all tests together.
 * Two tests (5s + 4s), each within --testTimeout 6000, but 9s in all against --checkAttemptTimeout 8000:
 * the first passes, the second is cut off and reported as "did not run".
 */
import {test} from "@playwright/test";

test("takes 5s", async ({page}) => {
    await page.waitForTimeout(5000);
});

test("takes 4s", async ({page}) => {
    await page.waitForTimeout(4000);
});
