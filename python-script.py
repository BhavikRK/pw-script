from playwright.sync_api import sync_playwright, expect


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False
        )

        page = browser.new_page()

        # Open application
        page.goto("https://www.saucedemo.com/")

        # Login
        page.fill('[data-test="username"]', "standard_user")
        page.fill('[data-test="password"]', "secret_sauce")
        page.click('[data-test="login-button"]')

        expect(page).to_have_url("https://www.saucedemo.com/inventory.html")

        # Verify products
        expect(page.locator(".inventory_item")).to_have_count(6)

        # Add products
        page.click('[data-test="add-to-cart-sauce-labs-backpack"]')
        page.click('[data-test="add-to-cart-sauce-labs-bike-light"]')

        # Verify cart count
        expect(page.locator(".shopping_cart_badge")).to_have_text("2")

        # Open cart
        page.click(".shopping_cart_link")

        # Checkout
        page.click('[data-test="checkout"]')

        page.fill('[data-test="firstName"]', "Bhavik")
        page.fill('[data-test="lastName"]', "Kathrotiya")
        page.fill('[data-test="postalCode"]', "388001")

        page.click('[data-test="continue"]')

        # Verify summary page
        expect(page.locator(".summary_info")).to_be_visible()

        # Complete order
        page.click('[data-test="finish"]')

        expect(page.locator(".complete-header")).to_have_text(
            "Thank you for your order!"
        )

        # Screenshot
        page.screenshot(
            path="checkout-success.png",
            full_page=True
        )

        print("Checkout completed successfully")

        browser.close()


if __name__ == "__main__":
    run()
