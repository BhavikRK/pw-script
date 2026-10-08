/**
 * Playwright Test, cap vs a fixture's own {timeout}: the fixture asks for 10 minutes for its setup.
 * --testTimeout is a hard ceiling: a script can lower its budget, never raise it.
 * With --testTimeout 3000 -> 'Fixture "slowFixture" timeout of 3000ms exceeded during setup.'
 */
import {test as base} from "@playwright/test";

const test = base.extend<{ slowFixture: void }>({
    slowFixture: [async ({}, use) => {
        await new Promise((resolve) => setTimeout(resolve, 8000));
        await use();
    }, {timeout: 600_000}],
});

test("uses a slow fixture", async ({slowFixture}) => {});
