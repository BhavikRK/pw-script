import { expect, Page } from "playwright/test";

export default async function badsslMtls(page: Page) {
    const url = process.env.BADSSL_URL || "https://client.badssl.com/";

    await page.goto(url);

    // The success page is titled after the host; the certificate-less answer is nginx's 400, so the
    // title alone separates the two outcomes.
    await expect(page).toHaveTitle("client.badssl.com");
    await expect(page.locator("h1")).toContainText("badssl.com");

    // Green background is BadSSL's own signal that the request was accepted.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe("rgb(0, 128, 0)");
}
