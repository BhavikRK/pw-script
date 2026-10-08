/**
 * Playwright Test, cap vs test.setTimeout(0): the test asks for no limit at all.
 * --testTimeout is a hard ceiling: a script can lower its budget, never raise it.
 * With --testTimeout 3000 -> "Test timeout of 3000ms exceeded."
 */
import {test} from "@playwright/test";

test("asks for no limit", async ({page}) => {
    test.setTimeout(0);
    await page.waitForTimeout(8000);
});
