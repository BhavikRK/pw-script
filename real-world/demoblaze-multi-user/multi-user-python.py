"""
Two Demoblaze shoppers in isolated browser contexts (pytest-playwright writes one trace per
context), with accounts created fresh for every run.

test_carts_are_per_account: a cart belongs to its account, not to the browser - it is invisible to
the other shopper and survives a logout and a login from a new context.
test_login_rules: one test per rule the login and sign-up forms must enforce.
"""

import re
import time

import pytest
from playwright.sync_api import Browser, Page, expect

BASE_URL = "https://www.demoblaze.com"
RUN = format(int(time.time() * 1000), "x")
PASSWORD = f"Asm-{RUN}-pw"
CART_TIMEOUT = 15000


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    # Check agents run Chromium in containers with a small /dev/shm, where it crashes renderers.
    return {**browser_type_launch_args, "args": [*browser_type_launch_args.get("args", []), "--disable-dev-shm-usage"]}


def _shopper(browser: Browser) -> Page:
    context = browser.new_context()
    # Product photos starve the browser on a constrained agent and are not what is checked here.
    context.route(re.compile(r"\.(png|jpe?g|webp|gif)(\?|$)"), lambda route: route.abort())
    page = context.new_page()
    page.alerts = []
    page.on("dialog", lambda d: (page.alerts.append(d.message), d.accept()))
    return page


def _new_alert(page: Page, seen: int, timeout_ms: int = 5000) -> str:
    """The first alert raised after `seen` alerts had been recorded, or "" if none comes."""
    for _ in range(timeout_ms // 100):
        if len(page.alerts) > seen:
            return page.alerts[seen]
        page.wait_for_timeout(100)
    return ""


def _sign_up(page: Page, username: str, password: str) -> str:
    page.goto(BASE_URL)
    page.locator("#signin2").click()
    page.locator("#sign-username").fill(username)
    page.locator("#sign-password").fill(password)
    seen = len(page.alerts)
    with page.expect_response(lambda r: r.url.endswith("/signup")):
        page.locator("#signInModal").get_by_role("button", name="Sign up").click()
    return _new_alert(page, seen)


def _log_in(page: Page, username: str, password: str) -> int:
    """Submits the login form; returns the alert count from before, for _new_alert."""
    page.goto(BASE_URL)
    page.locator("#login2").click()
    page.locator("#loginusername").fill(username)
    page.locator("#loginpassword").fill(password)
    seen = len(page.alerts)
    with page.expect_response(lambda r: r.url.endswith("/login")):
        page.locator("#logInModal").get_by_role("button", name="Log in").click()
    return seen


def _add(page: Page, title: str):
    page.goto(BASE_URL)
    page.get_by_role("link", name=title, exact=True).click()
    expect(page.locator(".name")).to_have_text(title)
    with page.expect_response(lambda r: r.url.endswith("/addtocart") and r.ok):
        page.get_by_role("link", name="Add to cart").click()


def _cart(page: Page) -> list:
    with page.expect_response(lambda r: r.url.endswith("/viewcart") and r.ok) as cart:
        page.goto(f"{BASE_URL}/cart.html")
    count = len(cart.value.json()["Items"])
    expect(page.locator("#tbodyid tr")).to_have_count(count, timeout=CART_TIMEOUT)
    return sorted(page.locator("#tbodyid tr td:nth-child(2)").all_inner_texts())


def test_carts_are_per_account(browser: Browser):
    dana, erik = f"asm-dana-{RUN}", f"asm-erik-{RUN}"
    dana_page, erik_page = _shopper(browser), _shopper(browser)

    for page, name in ((dana_page, dana), (erik_page, erik)):
        assert _sign_up(page, name, PASSWORD) == "Sign up successful."
        _log_in(page, name, PASSWORD)
        expect(page.locator("#nameofuser")).to_have_text(f"Welcome {name}")

    _add(dana_page, "Iphone 6 32gb")
    _add(erik_page, "HTC One M9")

    assert _cart(dana_page) == ["Iphone 6 32gb"]
    assert _cart(erik_page) == ["HTC One M9"]

    # Dana logs out, then back in from a brand-new context: the cart is still hers.
    dana_page.goto(BASE_URL)
    dana_page.locator("#logout2").click()
    expect(dana_page.locator("#login2")).to_be_visible()
    assert _cart(dana_page) == []

    elsewhere = _shopper(browser)
    _log_in(elsewhere, dana, PASSWORD)
    expect(elsewhere.locator("#nameofuser")).to_have_text(f"Welcome {dana}")
    assert _cart(elsewhere) == ["Iphone 6 32gb"]


@pytest.fixture(scope="module")
def existing_user(browser: Browser) -> str:
    name = f"asm-frida-{RUN}"
    assert _sign_up(_shopper(browser), name, PASSWORD) == "Sign up successful."
    return name


RULES = [
    pytest.param("signup-duplicate", "This user already exist.", id="duplicate-sign-up-refused"),
    pytest.param("login-wrong-password", "Wrong password.", id="wrong-password-refused"),
    pytest.param("login-unknown-user", "User does not exist.", id="unknown-user-refused"),
]


@pytest.mark.parametrize("case,expected", RULES)
def test_login_rules(browser: Browser, existing_user: str, case: str, expected: str):
    page = _shopper(browser)
    if case == "signup-duplicate":
        assert _sign_up(page, existing_user, "another-password") == expected
    else:
        user = existing_user if case == "login-wrong-password" else f"asm-nobody-{RUN}"
        password = "wrong-password" if case == "login-wrong-password" else PASSWORD
        seen = _log_in(page, user, password)
        assert _new_alert(page, seen) == expected
        expect(page.locator("#nameofuser")).to_be_hidden()
