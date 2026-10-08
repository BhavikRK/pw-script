"""
pytest, a context the test creates itself and sets nothing on: the flag fills in.
With --actionTimeout 2000 -> "Timeout 2000ms exceeded."
"""


def test_clicks_what_is_not_there(browser):
    context = browser.new_context()
    page = context.new_page()
    page.set_content("<button>ok</button>")
    page.click("#missing")
