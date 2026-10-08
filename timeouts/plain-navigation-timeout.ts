/**
 * Plain script, --navigationTimeout: each navigation on its own.
 * https://httpbin.org/delay/10 answers after 10s; with --navigationTimeout 3000 -> "page.goto: Timeout 3000ms exceeded."
 */
import {Page} from "playwright";

export default async function plain_navigation_timeout(page: Page) {
    await page.goto("https://httpbin.org/delay/10");
}
