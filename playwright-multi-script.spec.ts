/**
 * To learn more about Playwright Test visit:
 * https://checklyhq.com/docs/browser-checks/playwright-test/
 * https://playwright.dev/docs/writing-tests
 */

import { test, expect } from '@playwright/test';

// Configure the Playwright Test timeout to 210 seconds,
// ensuring that longer tests conclude before Checkly's browser check timeout of 240 seconds.
// The default Playwright Test timeout is set at 30 seconds.
// For additional information on timeouts, visit: https://checklyhq.com/docs/browser-checks/timeouts/
test.setTimeout(210000)

// Set the action timeout to 10 seconds to quickly identify failing actions.
// By default Playwright Test has no timeout for actions (e.g. clicking an element).
test.use({ actionTimeout: 10000 })

// You can use test.describe to declare a group of related test cases
test.describe('Playwright home page', () => {
    // The callback in test.beforeEach will be executed before each test.
    test.beforeEach(async ({ page }) => {
        // Each test will be given a new page instance navigated to the this URL
        // For deployments Checkly will inject the deployment url as ENVIRONMENT_URL
        await page.goto(process.env.ENVIRONMENT_URL || 'https://playwright.dev/')
    })
    // Other useful hooks: test.beforeAll, test.afterEach, test.afterAll

    test('has a page title containing Playwright', async ({ page }) => {
        // Expect a title "to contain" a substring.
        await expect(page).toHaveTitle(/Playwright/)
    })

    test("has a 'get started' link linking to the intro page", async ({ page }) => {
        // Create a locator based on a text selector.
        const getStarted = page.getByText('Get Started')
        // Use the locator for runtime 2022.02:
        // const getStarted = page.locator('text=Get Started')

        // Expect an attribute "to be strictly equal" to the value.
        await expect(getStarted).toHaveAttribute('href', '/docs/intro')

        // Click the get started link.
        await getStarted.click()

        // Expects the URL to contain intro.
        await expect(page).toHaveURL(/.*intro/)
    })

    test.describe('has Open Graph tags', () => {
        const tags = ['description', 'title', 'url']

        // You can create tests from an array, by calling "test()" in a loop
        tags.forEach((tag) => {
            test(`has the Open Graph tag "${tag}"`, async ({ page }) => {
                await expect(page.locator(`meta[property="og:${tag}"]`)).toHaveCount(1)
            })
        })
    })
})
