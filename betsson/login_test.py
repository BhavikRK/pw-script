import re
from playwright.sync_api import Page, expect

def betsson_login(page: Page):
    page.goto("https://www.betsson.com/en")
    page.get_by_text("Log in").click()
    page.locator('[data-test-id="email-input"]').fill("sreliveopsbethany.matthews@betssongroup.com")
    page.locator('[data-test-id="password-input"]').fill("MKfK28XHUd1h")
    page.locator('[data-test-id="account-login-btn-1"]').click()
    page.locator('[data-test-id="balance-button"]').click()
    page.screenshot(path=login_screenshot_path_name)
    page.locator('[data-test-id="site-menu-link-router-link-log-out"]').click()
