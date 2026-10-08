/**
 * Playwright Test, cap vs test.slow(): the test asks for three times its budget.
 * --testTimeout is a hard ceiling: a script can lower its budget, never raise it.
 * With --testTimeout 3000 -> "Test timeout of 3000ms exceeded." (not 9000ms)
 */
import {test} from "@playwright/test";

test("marks itself slow", async ({page}) => {
    test.slow();
    await page.waitForTimeout(8000);
});
