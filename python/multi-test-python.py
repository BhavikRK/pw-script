import re

from playwright.sync_api import BrowserContext, Page, expect

BASE_URL = "https://the-internet.herokuapp.com"


def test_home_page(page: Page):
    page.goto(BASE_URL)
    expect(page).to_have_title("The Internet")
    expect(page.get_by_role("heading", level=1)).to_have_text("Welcome to the-internet")


def test_dynamic_loading(page: Page):
    page.goto(f"{BASE_URL}/dynamic_loading/1")
    page.get_by_role("button", name="Start").click()
    # The text appears after a few seconds of loading.
    expect(page.locator("#finish")).to_have_text("Hello World!", timeout=15000)


def test_new_tab(page: Page, context: BrowserContext):
    page.goto(f"{BASE_URL}/windows")
    with context.expect_page() as new_page_info:
        page.get_by_role("link", name="Click Here").click()
    new_page = new_page_info.value
    new_page.wait_for_load_state()
    expect(new_page.get_by_role("heading")).to_have_text("New Window")
    new_page.close()
    expect(page).to_have_url(re.compile(r".*/windows$"))
