/**
 * Playwright Test, cap vs test.setTimeout(): the test asks for 10 minutes.
 * --testTimeout is a hard ceiling: a script can lower its budget, never raise it.
 * With --testTimeout 3000 -> "Test timeout of 3000ms exceeded."
 */
import {test} from "@playwright/test";

test("asks for 10 minutes", async ({page}) => {
    test.setTimeout(600_000);
    await page.waitForTimeout(8000);
});
