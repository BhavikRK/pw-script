/**
 * Playwright Test, config under the CLI: lower-timeouts.config.ts allows 1.5s per test.
 * With --testTimeout 60000 the config's lower budget is kept -> "Test timeout of 1500ms exceeded."
 */
import {test} from "@playwright/test";

test("outlasts the config", async ({page}) => {
    await page.waitForTimeout(4000);
});
