/**
 * Playwright Test, lowering under the cap is allowed: the test asks for 1.5s.
 * --testTimeout is a hard ceiling: a script can lower its budget, never raise it.
 * With --testTimeout 3000 -> "Test timeout of 1500ms exceeded." (the test's own, lower budget)
 */
import {test} from "@playwright/test";

test("asks for less", async ({page}) => {
    test.setTimeout(1500);
    await page.waitForTimeout(2500);
});
