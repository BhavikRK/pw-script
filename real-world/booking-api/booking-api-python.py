"""
API-only check of Restful-booker with Playwright's APIRequestContext - no browser page at all.

Complements booking-api.spec.ts rather than repeating it: malformed payloads are rejected (one test
per case), a date-range search finds a booking we create, and every booking created is cleaned up in
the fixture's teardown even when the test fails.

The admin account is the API's published one; override it with
--envVars BOOKER_USER=... BOOKER_PASSWORD=...
"""

import os
import time
from datetime import date, timedelta
from typing import Generator

import pytest
from playwright.sync_api import APIRequestContext, Playwright

BASE_URL = "https://restful-booker.herokuapp.com"
BOOKER_USER = os.environ.get("BOOKER_USER", "admin")
BOOKER_PASSWORD = os.environ.get("BOOKER_PASSWORD", "password123")


@pytest.fixture(scope="module")
def api(playwright: Playwright) -> Generator[APIRequestContext, None, None]:
    context = playwright.request.new_context(base_url=BASE_URL, extra_http_headers={"Accept": "application/json"})
    yield context
    context.dispose()


@pytest.fixture(scope="module")
def token(api: APIRequestContext) -> str:
    response = api.post("/auth", data={"username": BOOKER_USER, "password": BOOKER_PASSWORD})
    assert response.ok
    value = response.json().get("token")
    assert value, "auth returned no token - are the credentials right?"
    return value


@pytest.fixture
def created(api: APIRequestContext, token: str) -> Generator[list, None, None]:
    """Collects the ids of bookings a test creates and deletes them afterwards."""
    ids: list = []
    yield ids
    for booking_id in ids:
        api.delete(f"/booking/{booking_id}", headers={"Cookie": f"token={token}"})


def _booking(checkin: date, nights: int = 2) -> dict:
    return {
        "firstname": "Asm",
        "lastname": f"Py{int(time.time() * 1000)}",
        "totalprice": 320,
        "depositpaid": False,
        "bookingdates": {
            "checkin": checkin.isoformat(),
            "checkout": (checkin + timedelta(days=nights)).isoformat(),
        },
        "additionalneeds": "Airport transfer",
    }


def _without(payload: dict, key: str) -> dict:
    return {k: v for k, v in payload.items() if k != key}


MALFORMED = [
    pytest.param(lambda b: _without(b, "firstname"), id="missing-firstname"),
    pytest.param(lambda b: _without(b, "bookingdates"), id="missing-dates"),
    # A known defect: the API stores a non-numeric price as null instead of refusing it. Strict, so
    # the check flags the day it is fixed and this mark can go.
    pytest.param(
        lambda b: {**b, "totalprice": "a lot"},
        id="price-not-a-number",
        marks=pytest.mark.xfail(strict=True, reason="restful-booker stores a non-numeric price as null"),
    ),
    pytest.param(lambda b: {}, id="empty-body"),
]


@pytest.mark.parametrize("mutate", MALFORMED)
def test_malformed_booking_is_rejected(api: APIRequestContext, created: list, mutate):
    response = api.post("/booking", data=mutate(_booking(date.today() + timedelta(days=10))))
    if response.ok:
        created.append(response.json()["bookingid"])
    # Restful-booker rejects these with a server error rather than a 400 - still a rejection, and
    # what matters to a monitor is that nothing was stored.
    assert response.status >= 400, f"accepted a malformed booking: {response.text()}"


def test_date_range_search_finds_the_booking(api: APIRequestContext, created: list):
    checkin = date.today() + timedelta(days=60)
    booking = _booking(checkin, nights=3)
    response = api.post("/booking", data=booking)
    assert response.ok
    booking_id = response.json()["bookingid"]
    created.append(booking_id)

    by_name = api.get("/booking", params={"firstname": booking["firstname"], "lastname": booking["lastname"]})
    assert booking_id in [b["bookingid"] for b in by_name.json()]

    # checkin/checkout filters are exclusive bounds, so search a window around the stay.
    window = api.get(
        "/booking",
        params={
            "checkin": (checkin - timedelta(days=1)).isoformat(),
            "checkout": (checkin + timedelta(days=4)).isoformat(),
        },
    )
    assert window.ok
    assert booking_id in [b["bookingid"] for b in window.json()]


def test_deleted_booking_is_gone(api: APIRequestContext, token: str):
    response = api.post("/booking", data=_booking(date.today() + timedelta(days=5)))
    booking_id = response.json()["bookingid"]

    assert api.delete(f"/booking/{booking_id}", headers={"Cookie": f"token={token}"}).status == 201
    assert api.get(f"/booking/{booking_id}").status == 404
    # Deleting twice is not an error worth a 2xx.
    assert api.delete(f"/booking/{booking_id}", headers={"Cookie": f"token={token}"}).status >= 400
