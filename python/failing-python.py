from playwright.sync_api import Page, expect

BASE_URL = "https://www.saucedemo.com"


def test_login_fails(page: Page):
    """Fails on purpose: the locked-out user cannot log in, so the products page never appears."""
    page.goto(BASE_URL)
    page.locator('[data-test="username"]').fill("locked_out_user")
    page.locator('[data-test="password"]').fill("secret_sauce")
    page.locator('[data-test="login-button"]').click()
    expect(page.locator('[data-test="title"]')).to_have_text("Products", timeout=5000)
