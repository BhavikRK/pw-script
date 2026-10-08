"""
pytest, the test file's own `context` fixture sets a 1000ms action timeout.
With --actionTimeout 60000 the script's value is used -> "Timeout 1000ms exceeded."
"""
import pytest


@pytest.fixture
def context(browser):
    context = browser.new_context()
    context.set_default_timeout(1000)
    yield context
    context.close()


def test_clicks_what_is_not_there(page):
    page.set_content("<button>ok</button>")
    page.click("#missing")
