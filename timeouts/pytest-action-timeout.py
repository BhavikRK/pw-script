"""
pytest, --actionTimeout: each action on its own.
A click on an element that never appears, with --actionTimeout 2000 -> "Page.click: Timeout 2000ms exceeded."
"""

def test_clicks_what_is_not_there(page):
    page.set_content("<button>ok</button>")
    page.click("#missing")
