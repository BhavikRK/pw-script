"""
Network techniques on the Demoblaze front end, from Python:

- record the live API into a HAR, then replay it with the API cut off: the page must render the
  same products from the recording alone, which is how a check is made independent of a backend;
- count the API calls one category click makes, catching the double-fetch regressions that slow a
  page down without ever failing a functional check.
"""

import re

import pytest
from playwright.sync_api import Browser, Page, expect

BASE_URL = "https://www.demoblaze.com"
API = re.compile(r"api\.demoblaze\.com/")
IMAGES = re.compile(r"\.(png|jpe?g|webp|gif)(\?|$)")


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    # Check agents run Chromium in containers with a small /dev/shm, where it crashes renderers.
    return {**browser_type_launch_args, "args": [*browser_type_launch_args.get("args", []), "--disable-dev-shm-usage"]}


def _catalog(page: Page) -> list:
    expect(page.locator("#tbodyid .card").first).to_be_visible()
    return page.locator("#tbodyid .card-title").all_inner_texts()


def test_catalog_replays_from_a_recording(browser: Browser, tmp_path):
    har = tmp_path / "demoblaze-api.har"

    # 1. Record: browse normally while every API call is written to the HAR.
    recording = browser.new_context()
    recording.route(IMAGES, lambda route: route.abort())
    recording.route_from_har(har, url=API, update=True)
    page = recording.new_page()
    page.goto(BASE_URL)
    live = _catalog(page)
    recording.close()  # the HAR is written on close
    assert har.stat().st_size > 0

    # 2. Replay: answer API calls from the HAR only. Anything not recorded is aborted, so a request
    # the recording did not cover fails loudly instead of quietly reaching the real API.
    replay = browser.new_context()
    replay.route(IMAGES, lambda route: route.abort())
    replay.route_from_har(har, url=API, not_found="abort")
    page = replay.new_page()
    page.goto(BASE_URL)
    assert _catalog(page) == live
    replay.close()


def test_one_category_click_makes_one_api_call(page: Page):
    page.route(IMAGES, lambda route: route.abort())
    page.goto(BASE_URL)
    expect(page.locator("#tbodyid .card").first).to_be_visible()

    calls = []
    page.on("request", lambda r: r.url.endswith("/bycat") and calls.append(r.post_data or ""))

    with page.expect_response(lambda r: r.url.endswith("/bycat")) as response:
        page.get_by_role("link", name="Phones").click()
    assert response.value.ok
    titles = [i["title"] for i in response.value.json()["Items"]]
    expect(page.locator("#tbodyid .card-title")).to_have_text(titles)

    # Let any late duplicate arrive before counting.
    page.wait_for_load_state("networkidle")
    assert len(calls) == 1, f"one category click made {len(calls)} calls: {calls}"
    assert '"phone"' in calls[0], f"the call does not ask for phones: {calls[0]}"
