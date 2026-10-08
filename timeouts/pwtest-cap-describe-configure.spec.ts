/**
 * Playwright Test, cap vs test.describe.configure({timeout}): the group asks for 10 minutes.
 * --testTimeout is a hard ceiling: a script can lower its budget, never raise it.
 * With --testTimeout 3000 -> "Test timeout of 3000ms exceeded."
 */
import {test} from "@playwright/test";

test.describe("configured group", () => {
    test.describe.configure({timeout: 600_000});

    test("runs in the group", async ({page}) => {
        await page.waitForTimeout(8000);
    });
});
