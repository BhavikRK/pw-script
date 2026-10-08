/**
 * Plain script, its own action timeout: the script sets 1000ms itself.
 * With --actionTimeout 60000 the script's value is used -> "page.click: Timeout 1000ms exceeded."
 */
import {Page} from "playwright";

export default async function plain_action_script(page: Page) {
    page.setDefaultTimeout(1000);
    await page.setContent("<button>ok</button>");
    await page.click("#missing");
}
