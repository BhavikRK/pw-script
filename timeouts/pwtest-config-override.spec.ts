/**
 * Playwright Test, CLI and --config together: timeouts.config.ts allows 6s per test and 30s per action.
 * With --actionTimeout 20000 the config's own 30s action timeout is kept over the flag, so the click
 * outlasts the config's 6s test timeout -> "Test timeout of 6000ms exceeded."
 */
import {test} from "@playwright/test";

test("clicks what is not there", async ({page}) => {
    await page.setContent("<button>ok</button>");
    await page.locator("#missing").click();
});
