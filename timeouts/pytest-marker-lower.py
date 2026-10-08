"""
pytest, the test's own pytest-timeout marker under the CLI: the test allows itself 1.5s.
With --testTimeout 60000 the marker's lower budget is kept -> "Test timeout of 1500ms exceeded."
"""
import pytest


@pytest.mark.timeout(1.5)
def test_outlasts_its_marker(page):
    page.wait_for_timeout(4000)
