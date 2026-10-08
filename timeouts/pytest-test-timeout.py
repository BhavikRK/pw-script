"""
pytest, --testTimeout: each test on its own.
An 8s test with --testTimeout 3000 -> "Test timeout of 3000ms exceeded."
"""

def test_takes_8s(page):
    page.wait_for_timeout(8000)
