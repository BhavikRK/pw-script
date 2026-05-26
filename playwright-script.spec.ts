    import {expect, Page} from "playwright/test";

    export default async function example(page: Page) {
        await page.goto("https://playwright.dev/");
        await expect(page).toHaveTitle(/Playwright/);

        await page.getByRole("link", { name: "Get started11" }).click();
        await expect(page.getByRole("heading", { name: "Installation" })).toBeVisible();
    }
