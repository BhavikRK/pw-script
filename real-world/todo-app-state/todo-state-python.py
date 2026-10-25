"""
TodoMVC state set up the fast way: instead of typing every item through the UI, the app's
localStorage is written by an init script before the page loads - how real suites skip slow setup
and start each test from a known state.

    --dataDir samples/real-world/todo-app-state/data

test_counter_per_open_count runs once per possible number of open items, from the CSV's rows.
"""

import csv
import json
import os
import uuid
from pathlib import Path

import pytest
from playwright.sync_api import BrowserContext, Page, expect

APP = "https://demo.playwright.dev/todomvc/#/"
STORAGE_KEY = "react-todos"


def _seed():
    data_dir = Path(os.environ.get("ASM_DATA_DIR", Path(__file__).parent / "data"))
    with open(data_dir / "todos.csv", newline="") as f:
        return [{"title": r["title"], "completed": r["completed"] == "true"} for r in csv.DictReader(f)]


SEED = _seed()


def _preload(context: BrowserContext, todos: list):
    stored = [{"id": str(uuid.uuid4()), **t} for t in todos]
    # Runs before any page script, on every navigation, so it must only seed an empty origin -
    # otherwise a reload would wipe the changes the test is checking survived.
    context.add_init_script(
        f"""if (!localStorage.getItem({json.dumps(STORAGE_KEY)}))
                localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(stored))});"""
    )


def _stored(page: Page) -> list:
    return page.evaluate(f"JSON.parse(localStorage.getItem('{STORAGE_KEY}') || '[]')")


def test_preloaded_state_renders_without_typing(page: Page, context: BrowserContext):
    _preload(context, SEED)
    page.goto(APP)
    expect(page.get_by_test_id("todo-item")).to_have_text([t["title"] for t in SEED])
    for todo in SEED:
        checkbox = page.get_by_test_id("todo-item").filter(has_text=todo["title"]).get_by_role("checkbox")
        expect(checkbox).to_be_checked(checked=todo["completed"])


@pytest.mark.parametrize("open_count", range(len(SEED) + 1))
def test_counter_per_open_count(page: Page, context: BrowserContext, open_count: int):
    todos = [{"title": t["title"], "completed": i >= open_count} for i, t in enumerate(SEED)]
    _preload(context, todos)
    page.goto(APP)

    counter = page.get_by_test_id("todo-count")
    # "1 item left" but "0 items left" and "2 items left": the classic pluralisation bug.
    expect(counter).to_have_text(f"{open_count} {'item' if open_count == 1 else 'items'} left")
    clear = page.get_by_role("button", name="Clear completed")
    if open_count == len(SEED):
        expect(clear).to_be_hidden()
    else:
        expect(clear).to_be_visible()


def test_toggle_changes_survive_reload(page: Page, context: BrowserContext):
    _preload(context, SEED)
    page.goto(APP)

    flipped = SEED[0]["title"]
    page.get_by_test_id("todo-item").filter(has_text=flipped).get_by_role("checkbox").click()
    page.reload()

    after = {t["title"]: t["completed"] for t in _stored(page)}
    assert after[flipped] is (not SEED[0]["completed"])
    assert all(after[t["title"]] == t["completed"] for t in SEED[1:])
