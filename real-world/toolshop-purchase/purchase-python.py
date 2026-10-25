"""
Data-driven checkout on Practice Software Testing's Toolshop: one test per payment scenario in
data/payments.json, so the run produces one trace per payment method.

    --dataDir samples/real-world/toolshop-purchase/data

Each scenario logs in, buys one product, takes its billing address from the shop's postcode lookup
and pays. Accepted scenarios must end in an invoice whose total matches the cart; rejected ones must
keep the payment button disabled and show the shop's validation message.

The account is the shop's published demo customer; override it with
--envVars TOOLSHOP_EMAIL=... TOOLSHOP_PASSWORD=...
"""

import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect

BASE_URL = "https://practicesoftwaretesting.com"
EMAIL = os.environ.get("TOOLSHOP_EMAIL", "customer@practicesoftwaretesting.com")
PASSWORD = os.environ.get("TOOLSHOP_PASSWORD", "welcome01")


def _scenarios():
    data_dir = Path(os.environ.get("ASM_DATA_DIR", Path(__file__).parent / "data"))
    with open(data_dir / "payments.json") as f:
        return [pytest.param(s, id=s["id"]) for s in json.load(f)]


def _money(text: str) -> float:
    return float(re.sub(r"[^0-9.]", "", text))


def _login(page: Page):
    page.goto(f"{BASE_URL}/auth/login")
    page.locator('[data-test="email"]').fill(EMAIL)
    page.locator('[data-test="password"]').fill(PASSWORD)
    page.locator('[data-test="login-submit"]').click()
    expect(page.locator('[data-test="page-title"]')).to_have_text("My account")


def _add_product_to_cart(page: Page, term: str, name: str) -> float:
    page.goto(BASE_URL)
    page.locator('[data-test="search-query"]').fill(term)
    page.locator('[data-test="search-submit"]').click()
    expect(page.locator('[data-test="search_completed"]')).to_be_visible()
    page.locator("a.card").filter(has=page.get_by_text(name, exact=True)).click()
    expect(page.locator('[data-test="product-name"]')).to_have_text(name)
    price = _money(page.locator('[data-test="unit-price"]').inner_text())
    page.locator('[data-test="add-to-cart"]').click()
    expect(page.get_by_role("alert").filter(has_text="Product added to shopping cart.")).to_be_visible()
    return price


def _billing_address(page: Page):
    page.locator('[data-test="proceed-1"]').click()
    page.locator('[data-test="proceed-2"]').click()
    # Street, city and state come from the shop's postcode lookup; the invoice is refused if they
    # disagree with the country, so let the lookup fill them and check it did.
    with page.expect_response(
        lambda r: "/postcode-lookup" in r.url and "house_number=1" in r.url and r.ok
    ) as lookup:
        page.locator('[data-test="country"]').select_option("NL")
        page.locator('[data-test="postal_code"]').fill("1012JS")
        page.locator('[data-test="house_number"]').fill("1")
        page.locator('[data-test="house_number"]').press("Tab")
    address = lookup.value.json()
    expect(page.locator('[data-test="street"]')).to_have_value(address["street"])
    expect(page.locator('[data-test="city"]')).to_have_value(address["city"])
    page.locator('[data-test="proceed-3"]').click()


@pytest.mark.parametrize("scenario", _scenarios())
def test_checkout_with_payment_method(page: Page, scenario: dict):
    _login(page)
    price = _add_product_to_cart(page, "pliers", "Combination Pliers")

    page.locator('[data-test="nav-cart"]').click()
    expect(page.locator('[data-test="cart-total"]')).to_have_text(f"${price:.2f}")
    _billing_address(page)

    page.locator('[data-test="payment-method"]').select_option(scenario["method"])
    for field, value in scenario["fields"].items():
        control = page.locator(f'[data-test="{field}"]')
        if control.evaluate("el => el.tagName") == "SELECT":
            control.select_option(value)
        else:
            control.fill(value)

    finish = page.locator('[data-test="finish"]')
    if not scenario["accepted"]:
        expect(page.get_by_text(scenario["error"])).to_be_visible()
        expect(finish).to_be_disabled()
        return

    finish.click()
    expect(page.locator('[data-test="payment-success-message"]')).to_have_text("Payment was successful")
    expect(finish).to_have_text("Confirm")
    finish.click()
    confirmation = page.locator("#order-confirmation")
    expect(confirmation).to_contain_text("Thanks for your order!", timeout=15000)
    invoice_number = re.search(r"INV-\d+", confirmation.inner_text()).group(0)

    page.goto(f"{BASE_URL}/account/invoices")
    row = page.locator("tr").filter(has_text=invoice_number)
    expect(row.locator("td").filter(has_text="$")).to_have_text(f"${price:.2f}")
