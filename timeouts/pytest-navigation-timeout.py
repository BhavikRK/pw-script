"""
pytest, --navigationTimeout: each navigation on its own.
https://httpbin.org/delay/10 answers after 10s; with --navigationTimeout 3000 -> "Page.goto: Timeout 3000ms exceeded."
"""

def test_loads_a_slow_page(page):
    page.goto("https://httpbin.org/delay/10")
