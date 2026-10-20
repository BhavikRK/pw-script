import re

from playwright.sync_api import Page, expect

# Public practice site for browser automation; its login is published on the page.
BASE_URL = "https://the-internet.herokuapp.com"


def test_interactions(page: Page, tmp_path):
    # Login
    page.goto(f"{BASE_URL}/login")
    page.get_by_label("Username").fill("tomsmith")
    page.get_by_label("Password").fill("SuperSecretPassword!")
    page.get_by_role("button", name="Login").click()
    expect(page.locator("#flash")).to_contain_text("You logged into a secure area!")
    page.get_by_role("link", name="Logout").click()
    expect(page.locator("#flash")).to_contain_text("You logged out of the secure area!")

    # Checkboxes
    page.goto(f"{BASE_URL}/checkboxes")
    boxes = page.locator("#checkboxes input")
    boxes.nth(0).check()
    boxes.nth(1).uncheck()
    expect(boxes.nth(0)).to_be_checked()
    expect(boxes.nth(1)).not_to_be_checked()

    # Dropdown
    page.goto(f"{BASE_URL}/dropdown")
    page.locator("#dropdown").select_option("2")
    expect(page.locator("#dropdown")).to_have_value("2")

    # JavaScript dialogs: accept the confirm, answer the prompt
    page.goto(f"{BASE_URL}/javascript_alerts")
    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="Click for JS Confirm").click()
    expect(page.locator("#result")).to_have_text("You clicked: Ok")
    page.once("dialog", lambda dialog: dialog.accept("asm"))
    page.get_by_role("button", name="Click for JS Prompt").click()
    expect(page.locator("#result")).to_have_text("You entered: asm")

    # Iframe
    page.goto(f"{BASE_URL}/iframe")
    expect(page.frame_locator("#mce_0_ifr").locator("body")).to_be_visible()

    # Hover
    page.goto(f"{BASE_URL}/hovers")
    page.locator(".figure").first.hover()
    expect(page.get_by_text("name: user1")).to_be_visible()

    # File upload
    upload = tmp_path / "asm-upload.txt"
    upload.write_text("uploaded by the ASM runner sample")
    page.goto(f"{BASE_URL}/upload")
    page.locator("#file-upload").set_input_files(str(upload))
    page.locator("#file-submit").click()
    expect(page.locator("#uploaded-files")).to_have_text("asm-upload.txt")

    # Drag and drop
    page.goto(f"{BASE_URL}/drag_and_drop")
    page.locator("#column-a").drag_to(page.locator("#column-b"))
    expect(page.locator("#column-a header")).to_have_text("B")

    # Keyboard (the page does not report Enter, which submits its form instead)
    page.goto(f"{BASE_URL}/key_presses")
    page.locator("#target").press("Shift")
    expect(page.locator("#result")).to_have_text(re.compile("SHIFT"))
