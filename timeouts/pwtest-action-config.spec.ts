/**
 * Playwright Test, the config's own action timeout: lower-timeouts.config.ts sets use.actionTimeout 1000.
 * With --actionTimeout 60000 the config's value is used -> "locator.click: Timeout 1000ms exceeded."
 */
import {test} from "@playwright/test";

test("clicks what is not there", async ({page}) => {
    await page.setContent("<button>ok</button>");
    await page.locator("#missing").click();
});
