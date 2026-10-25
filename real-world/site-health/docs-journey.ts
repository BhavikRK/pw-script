import { expect, Page } from "playwright/test";

/*
 * Plain-script form of a docs journey: the runner launches the browser and hands this function a
 * page. Four pages a new user reads in order, each held to a load budget, with every console error
 * and failed request collected along the way and reported together at the end - so one run names
 * every problem instead of stopping at the first.
 */
const SITE = process.env.SITE_URL ?? "https://playwright.dev";
const PAGE_BUDGET_MS = Number(process.env.BUDGET_LOAD_MS ?? 6000);

export default async function docsJourney(page: Page) {
    const problems: string[] = [];
    page.on("console", msg => {
        if (msg.type() === "error") problems.push(`console on ${page.url()}: ${msg.text()}`);
    });
    page.on("pageerror", error => problems.push(`uncaught on ${page.url()}: ${error.message}`));
    page.on("response", response => {
        if (response.url().startsWith(SITE) && response.status() >= 400) {
            problems.push(`HTTP ${response.status()}: ${response.url()}`);
        }
    });

    const loadTime = () => page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        return Math.round(nav.loadEventEnd - nav.startTime);
    });

    // 1. Landing page.
    await page.goto(SITE, { waitUntil: "load" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const homeMs = await loadTime();
    if (homeMs > PAGE_BUDGET_MS) problems.push(`home page loaded in ${homeMs}ms (budget ${PAGE_BUDGET_MS}ms)`);

    // 2. Get started. The docs are a single-page app from here on, so further navigations are
    // client-side; what is measured is how long the new content takes to show.
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/docs\/intro/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Installation");

    // 3 and 4. Follow the "Next" pager twice, as a reader working through the guide would.
    for (const expected of ["Writing tests", "Generating tests"]) {
        const started = Date.now();
        await page.locator("a.pagination-nav__link--next").click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(expected);
        const ms = Date.now() - started;
        if (ms > PAGE_BUDGET_MS) problems.push(`"${expected}" took ${ms}ms to show (budget ${PAGE_BUDGET_MS}ms)`);
        // Code samples are the point of these pages; an empty one is a broken page.
        await expect(page.locator("main pre code").first()).not.toBeEmpty();
    }

    if (problems.length) {
        throw new Error(`Docs journey found ${problems.length} problem(s):\n${problems.join("\n")}`);
    }
}
