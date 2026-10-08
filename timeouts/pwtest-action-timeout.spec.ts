/**
 * Playwright Test, --actionTimeout: each action on its own (Playwright's use.actionTimeout).
 * A click on an element that never appears, with --actionTimeout 2000 -> "locator.click: Timeout 2000ms exceeded."
 */
import {test} from "@playwright/test";

test("clicks what is not there", async ({page}) => {
    await page.setContent("<button>ok</button>");
    await page.locator("#missing").click();
});
