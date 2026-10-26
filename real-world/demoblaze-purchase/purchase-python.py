"""
Data-driven orders on Demoblaze: one test per order in data/orders.json, so the run produces one
trace per order.

    --dataDir samples/real-world/demoblaze-purchase/data

Each order fills a fresh cart through the UI, checks the cart total against the prices the store
showed, and places the order. Accepted orders must produce a receipt whose amount, card and name
match, and must leave the cart empty on the server; refused ones must show the store's validation
message and send nothing.
"""

import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import BrowserContext, Page, expect

BASE_URL = "https://www.demoblaze.com"
CART_TIMEOUT = 15000


def _orders():
    data_dir = Path(os.environ.get("ASM_DATA_DIR", Path(__file__).parent / "data"))
    with open(data_dir / "orders.json") as f:
        return [pytest.param(o, id=o["id"]) for o in json.load(f)]


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    # Check agents run Chromium in containers with a small /dev/shm, where it crashes renderers.
    return {**browser_type_launch_args, "args": [*browser_type_launch_args.get("args", []), "--disable-dev-shm-usage"]}


@pytest.fixture
def shop(context: BrowserContext, page: Page) -> Page:
    # Product photos starve the browser on a constrained agent and are not what is checked here.
    context.route(re.compile(r"\.(png|jpe?g|webp|gif)(\?|$)"), lambda route: route.abort())
    messages = []
    page.on("dialog", lambda d: (messages.append(d.message), d.accept()))
    page.alerts = messages
    page.goto(BASE_URL)
    expect(page.locator("#tbodyid .card").first).to_be_visible()
    return page


def _money(text: str) -> int:
    return int(re.sub(r"[^0-9]", "", text))


def _add(page: Page, category: str, title: str) -> int:
    page.goto(BASE_URL)
    # The home grid shows one page of mixed products; a category lists all of its own.
    with page.expect_response(lambda r: r.url.endswith("/bycat") and r.ok):
        page.get_by_role("link", name=category).click()
    card = page.locator("#tbodyid .card").filter(has=page.get_by_role("link", name=title, exact=True))
    price = _money(card.locator("h5").inner_text())
    card.get_by_role("link", name=title, exact=True).click()
    expect(page.locator(".name")).to_have_text(title)
    with page.expect_response(lambda r: r.url.endswith("/addtocart") and r.ok):
        page.get_by_role("link", name="Add to cart").click()
    return price


@pytest.mark.parametrize("order", _orders())
def test_order(shop: Page, order: dict):
    page = shop
    prices = [_add(page, p["category"], p["title"]) for p in order["products"]]
    total = sum(prices)

    page.goto(f"{BASE_URL}/cart.html")
    expect(page.locator("#tbodyid tr")).to_have_count(len(order["products"]), timeout=CART_TIMEOUT)
    expect(page.locator("#totalp")).to_have_text(str(total), timeout=CART_TIMEOUT)

    page.get_by_role("button", name="Place Order").click()
    form = page.locator("#orderModal")
    expect(form.locator("#totalm")).to_have_text(f"Total: {total}")
    for field, value in order["customer"].items():
        form.locator(f"#{field}").fill(value)

    if not order["accepted"]:
        sent = []
        page.on("request", lambda r: r.url.endswith("/deletecart") and sent.append(r.url))
        # This alert fires inside the click, so it has been handled by the time the click returns.
        form.get_by_role("button", name="Purchase").click()
        assert page.alerts[-1] == order["error"]
        assert not sent, "a refused order still reached the API"
        return

    with page.expect_response(lambda r: r.url.endswith("/deletecart")) as emptied:
        form.get_by_role("button", name="Purchase").click()
    receipt = page.locator(".sweet-alert")
    expect(receipt.locator("h2")).to_have_text("Thank you for your purchase!")
    text = receipt.locator("p").inner_text()
    assert re.search(r"Id: \d+", text)
    assert f"Amount: {total} USD" in text
    assert f"Card Number: {order['customer']['card']}" in text
    assert f"Name: {order['customer']['name']}" in text

    # The order empties the cart on the server.
    assert emptied.value.ok
    with page.expect_response(lambda r: r.url.endswith("/viewcart") and r.ok) as cart:
        page.goto(f"{BASE_URL}/cart.html")
    assert cart.value.json()["Items"] == []
