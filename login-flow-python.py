import re

from playwright.sync_api import Page, expect

# Public demo shop; these are its published test credentials.
BASE_URL = "https://www.saucedemo.com"
USERNAME = "standard_user"
PASSWORD = "secret_sauce"


def test_login_and_checkout(page: Page):
    # Login
    page.goto(BASE_URL)
    expect(page).to_have_title("Swag Labs")
    page.locator('[data-test="username"]').fill(USERNAME)
    page.locator('[data-test="password"]').fill(PASSWORD)
    page.locator('[data-test="login-button"]').click()
    expect(page).to_have_url(re.compile(r".*/inventory\.html"))
    expect(page.locator('[data-test="title"]')).to_have_text("Products")

    # Browse: sort by price and open a product
    page.locator('[data-test="product-sort-container"]').select_option("lohi")
    expect(page.locator('[data-test="inventory-item-price"]').first).to_have_text("$7.99")
    page.get_by_text("Sauce Labs Backpack").click()
    expect(page.locator('[data-test="inventory-item-name"]')).to_have_text("Sauce Labs Backpack")
    page.locator('[data-test="add-to-cart"]').click()
    page.locator('[data-test="back-to-products"]').click()

    # Add a second item from the list and check the cart badge
    page.locator('[data-test="add-to-cart-sauce-labs-bike-light"]').click()
    expect(page.locator('[data-test="shopping-cart-badge"]')).to_have_text("2")

    # Cart: remove one item
    page.locator('[data-test="shopping-cart-link"]').click()
    expect(page.locator('[data-test="inventory-item"]')).to_have_count(2)
    page.locator('[data-test="remove-sauce-labs-bike-light"]').click()
    expect(page.locator('[data-test="inventory-item"]')).to_have_count(1)

    # Checkout
    page.locator('[data-test="checkout"]').click()
    page.locator('[data-test="firstName"]').fill("Test")
    page.locator('[data-test="lastName"]').fill("User")
    page.locator('[data-test="postalCode"]').fill("12345")
    page.locator('[data-test="continue"]').click()
    expect(page.locator('[data-test="total-label"]')).to_contain_text("$32.39")
    page.locator('[data-test="finish"]').click()
    expect(page.locator('[data-test="complete-header"]')).to_have_text("Thank you for your order!")
    page.locator('[data-test="back-to-products"]').click()

    # Logout
    page.get_by_role("button", name="Open Menu").click()
    page.locator('[data-test="logout-sidebar-link"]').click()
    expect(page.locator('[data-test="login-button"]')).to_be_visible()
