/**
 * Plain script, --actionTimeout: each action on its own.
 * A click on an element that never appears, with --actionTimeout 2000 -> "page.click: Timeout 2000ms exceeded."
 */
import {Page} from "playwright";

export default async function plain_action_timeout(page: Page) {
    await page.setContent("<button>ok</button>");
    await page.click("#missing");
}
