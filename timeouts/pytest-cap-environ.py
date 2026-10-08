"""
pytest, cap vs os.environ: the module tries to raise its own budget as it is imported.
--testTimeout is a hard ceiling; the plugin read it before this module loaded.
With --testTimeout 3000 -> "Test timeout of 3000ms exceeded."
"""

import os

os.environ["ASM_TEST_TIMEOUT"] = "600000"
os.environ["ASM_CHECK_ATTEMPT_TIMEOUT"] = "600000"


def test_asks_for_10_minutes(page):
    page.wait_for_timeout(8000)
