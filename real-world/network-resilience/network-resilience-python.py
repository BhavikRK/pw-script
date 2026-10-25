"""
Network techniques on the Toolshop front end, from Python:

- record the live API into a HAR, then replay it with the API cut off: the page must render the
  same products from the recording alone, which is how a check is made independent of a backend;
- count the API calls one search makes, catching the double-fetch regressions that slow a page down
  without ever failing a functional check.
"""

import re

from playwright.sync_api import Browser, Page, expect

BASE_URL = "https://practicesoftwaretesting.com"
API = re.compile(r"api\.practicesoftwaretesting\.com/")


def _catalog_names(page: Page) -> list:
    expect(page.locator("a.card").first).to_be_visible()
    return page.locator('[data-test="product-name"]').all_inner_texts()


def test_catalog_replays_from_a_recording(browser: Browser, tmp_path):
    har = tmp_path / "toolshop-api.har"

    # 1. Record: browse normally while every API call is written to the HAR.
    recording = browser.new_context()
    recording.route_from_har(har, url=API, update=True)
    page = recording.new_page()
    page.goto(BASE_URL)
    live = _catalog_names(page)
    recording.close()  # the HAR is written on close
    assert har.stat().st_size > 0

    # 2. Replay: answer API calls from the HAR only. Anything not recorded is aborted, so a request
    # the recording did not cover fails loudly instead of quietly reaching the real API.
    replay = browser.new_context()
    replay.route_from_har(har, url=API, not_found="abort")
    page = replay.new_page()
    page.goto(BASE_URL)
    assert _catalog_names(page) == live
    replay.close()


def test_one_search_makes_one_search_call(page: Page):
    page.goto(BASE_URL)
    expect(page.locator("a.card").first).to_be_visible()

    search_calls = []
    # The term travels in the query string or the body depending on the method; keep both.
    page.on(
        "request",
        lambda r: "/products/search" in r.url and search_calls.append(f"{r.method} {r.url} {r.post_data or ''}"),
    )

    page.locator('[data-test="search-query"]').fill("saw")
    with page.expect_response(lambda r: "/products/search" in r.url) as response:
        page.locator('[data-test="search-submit"]').click()
    assert response.value.ok
    expect(page.locator('[data-test="search_completed"]')).to_be_visible()

    # Let any late duplicate arrive before counting.
    page.wait_for_load_state("networkidle")
    assert len(search_calls) == 1, f"one search made {len(search_calls)} calls: {search_calls}"
    assert "saw" in search_calls[0], f"the search call does not carry the term: {search_calls[0]}"
