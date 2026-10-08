"""
pytest, the test's own action timeout: an autouse fixture of the test file sets 1000ms on the context.
With --actionTimeout 60000 the test's value is used -> "Timeout 1000ms exceeded."
"""
import pytest


@pytest.fixture(autouse=True)
def own_timeout(context):
    context.set_default_timeout(1000)


def test_clicks_what_is_not_there(page):
    page.set_content("<button>ok</button>")
    page.click("#missing")
