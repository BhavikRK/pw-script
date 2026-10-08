/**
 * Playwright Test, cap vs a beforeAll hook: the hook asks for 10 minutes for itself.
 * --testTimeout is a hard ceiling: a script can lower its budget, never raise it.
 * With --testTimeout 3000 -> '"beforeAll" hook timeout of 3000ms exceeded.'
 */
import {test} from "@playwright/test";

test.beforeAll(async () => {
    test.setTimeout(600_000);
    await new Promise((resolve) => setTimeout(resolve, 8000));
});

test("after a slow beforeAll", async () => {});
