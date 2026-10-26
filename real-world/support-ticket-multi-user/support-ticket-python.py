"""
A support ticket handled by a customer and an admin at the same time, each in an isolated browser
context. pytest-playwright then writes one trace per context.

The customer files a message, the admin replies and resolves it, and the customer sees both the
reply and the RESOLVED status. The ticket text carries a run id so the check finds its own ticket on
a shared public instance.

The accounts are Practice Software Testing's published demo users; override them with
--envVars CUSTOMER_EMAIL=... CUSTOMER_PASSWORD=... ADMIN_EMAIL=... ADMIN_PASSWORD=...
"""

import os
import re
import time

from playwright.sync_api import Page, expect

BASE_URL = "https://practicesoftwaretesting.com"
CUSTOMER = (
    os.environ.get("CUSTOMER_EMAIL", "customer2@practicesoftwaretesting.com"),
    os.environ.get("CUSTOMER_PASSWORD", "welcome01"),
)
ADMIN = (
    os.environ.get("ADMIN_EMAIL", "admin@practicesoftwaretesting.com"),
    os.environ.get("ADMIN_PASSWORD", "welcome01"),
)


def _login(page: Page, email: str, password: str):
    page.goto(f"{BASE_URL}/auth/login")
    page.locator('[data-test="email"]').fill(email)
    page.locator('[data-test="password"]').fill(password)
    page.locator('[data-test="login-submit"]').click()
    expect(page.locator('[data-test="nav-menu"]')).to_be_visible()


def test_ticket_resolved_by_admin(page: Page, new_context):
    run_id = f"ASM-{int(time.time() * 1000)}"
    question = f"[{run_id}] The pliers I received are damaged. Can I return them?"
    answer = f"[{run_id}] Sorry about that - a return label is on its way to you."

    customer = page
    admin = new_context().new_page()
    _login(customer, *CUSTOMER)
    _login(admin, *ADMIN)

    # Customer files the ticket; its id comes back in the API response.
    customer.goto(f"{BASE_URL}/contact")
    customer.locator('[data-test="subject"]').select_option(label="Return")
    customer.locator('[data-test="message"]').fill(question)
    with customer.expect_response(
        lambda r: r.url.endswith("/messages") and r.request.method == "POST"
    ) as sent:
        customer.locator('[data-test="contact-submit"]').click()
    assert sent.value.status == 200
    message_id = sent.value.json()["id"]
    expect(customer.get_by_role("alert")).to_have_text("Thanks for your message! We will contact you shortly.")

    # Admin replies, then resolves. The order matters: posting a reply moves the ticket back to
    # IN_PROGRESS, so a status set before the reply would be overwritten.
    admin.goto(f"{BASE_URL}/admin/messages")
    admin.locator(f'[data-test="message-details-{message_id}"]').click()
    expect(admin.get_by_text(question)).to_be_visible()
    admin.locator('[data-test="message"]').fill(answer)
    admin.locator('[data-test="reply-submit"]').click()
    expect(admin.get_by_text(answer)).to_be_visible()
    with admin.expect_response(lambda r: f"/messages/{message_id}/status" in r.url and r.ok):
        admin.locator('[data-test="status"]').select_option("RESOLVED")

    # Customer sees the outcome.
    customer.goto(f"{BASE_URL}/account/messages/{message_id}")
    expect(customer.get_by_text(answer)).to_be_visible()
    customer.goto(f"{BASE_URL}/account/messages")
    expect(customer.locator("tr").filter(has_text=run_id)).to_contain_text("RESOLVED")


def test_customer_cannot_open_the_admin_inbox(page: Page):
    _login(page, *CUSTOMER)
    page.goto(f"{BASE_URL}/admin/messages")
    # The back office is guarded: a customer is sent to the login page and never sees the inbox.
    expect(page).to_have_url(re.compile(r"/auth/login$"))
    expect(page.locator('[data-test^="message-details-"]')).to_have_count(0)
