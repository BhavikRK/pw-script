"""
Proves the browser's traffic goes through --proxyServer, using https://api.ipify.org/?format=json:

    asm-playwright-runner samples/proxy/proxy-ipify-python.py --proxyServer http://103.237.102.191:11111

- The browser (proxied) must see a different IP than this Python process (never proxied).
- When the proxy host is an IP address, the browser must see exactly that IP. For a proxy whose
  egress IP differs from its host, pass it with --envVars EXPECTED_PROXY_IP=<ip>.
"""

import ipaddress
import json
import os
import re
import urllib.request
from typing import Optional
from urllib.parse import urlparse

import pytest
from playwright.sync_api import Page

IPIFY = "api.ipify.org/?format=json"


def expected_proxy_ip() -> Optional[str]:
    """The IP the proxy should present: EXPECTED_PROXY_IP, else the --proxyServer host if it is an IP."""
    if os.environ.get("EXPECTED_PROXY_IP"):
        return os.environ["EXPECTED_PROXY_IP"].strip()

    server = os.environ.get("ASM_PROXY_SERVER")
    if not server:
        return None
    host = urlparse(server if "://" in server else f"http://{server}").hostname or ""
    try:
        return str(ipaddress.ip_address(host))
    except ValueError:
        return None


EXPECTED = expected_proxy_ip()


@pytest.fixture(scope="module")
def direct_ip() -> str:
    """This process's own IP - urllib does not use the browser's proxy."""
    with urllib.request.urlopen(f"https://{IPIFY}", timeout=30) as response:
        ip = json.load(response)["ip"]

    print(f"Direct IP:   {ip}")
    print(f"Proxy:       {os.environ.get('ASM_PROXY_SERVER', '(no --proxyServer)')}")
    print(f"Expected IP: {EXPECTED or '(unknown - only checking it differs from the direct IP)'}")
    return ip


def browser_ip(page: Page, url: str) -> str:
    response = page.goto(url)
    assert response is not None and response.ok, f"{url} answered {response.status if response else None}"

    ip = str(json.loads(page.locator("body").inner_text()).get("ip", ""))
    assert re.fullmatch(r"[0-9a-fA-F.:]+", ip), f"no IP in {url}"
    return ip


@pytest.mark.parametrize("scheme", ["https", "http"])
def test_ipify_sees_the_proxy_ip(page: Page, direct_ip: str, scheme: str):
    ip = browser_ip(page, f"{scheme}://{IPIFY}")
    print(f"{scheme.upper()} via browser: {ip}")

    assert ip != direct_ip, "the request did not go through the proxy"
    if EXPECTED:
        assert ip == EXPECTED, f"browser saw {ip}, expected the proxy's {EXPECTED}"
