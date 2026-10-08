/**
 * Plain script, --testTimeout: the whole script is one test.
 * Two 4s waits with --testTimeout 3000 -> fails with "Test timeout of 3000ms exceeded."
 */
import {Page} from "playwright";

export default async function plain_test_timeout(page: Page) {
    await page.waitForTimeout(4000);
    await page.waitForTimeout(4000);
}
