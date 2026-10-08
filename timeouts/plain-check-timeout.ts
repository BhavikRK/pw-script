/**
 * Plain script, --checkAttemptTimeout: the script is the run's only test, so the run's budget cuts it off.
 * Two 4s waits with --checkAttemptTimeout 3000 -> fails with "Check timeout of 3000ms exceeded."
 */
import {Page} from "playwright";

export default async function plain_check_timeout(page: Page) {
    await page.waitForTimeout(4000);
    await page.waitForTimeout(4000);
}
