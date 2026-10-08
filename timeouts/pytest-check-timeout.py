"""
pytest, --checkAttemptTimeout: all tests together.
Two tests (5s + 4s), each within --testTimeout 6000, but 9s in all against --checkAttemptTimeout 8000:
the first passes, the second fails with "Check timeout of 8000ms exceeded." and the session stops.
"""

def test_takes_5s(page):
    page.wait_for_timeout(5000)


def test_takes_4s(page):
    page.wait_for_timeout(4000)
