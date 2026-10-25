import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/*
 * State management in a client-side app (Playwright's TodoMVC demo): the list is seeded from
 * data/todos.csv, then every change is checked twice - in what the user sees, and in what the app
 * persisted to localStorage, which is what survives a reload.
 *
 *     --dataDir samples/real-world/todo-app-state/data
 */
const APP = 'https://demo.playwright.dev/todomvc/#/';
const STORAGE_KEY = 'react-todos';

type Todo = { title: string; completed: boolean };

function seedTodos(): Todo[] {
    const dataDir = process.env.ASM_DATA_DIR ?? path.join(__dirname, 'data');
    const [, ...rows] = fs.readFileSync(path.join(dataDir, 'todos.csv'), 'utf8').trim().split(/\r?\n/);
    return rows.map(row => {
        const comma = row.lastIndexOf(',');
        return { title: row.slice(0, comma), completed: row.slice(comma + 1) === 'true' };
    });
}

const SEED = seedTodos();
const OPEN = SEED.filter(t => !t.completed);
const DONE = SEED.filter(t => t.completed);

async function stored(page: Page): Promise<Todo[]> {
    return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), STORAGE_KEY);
}

const items = (page: Page) => page.getByTestId('todo-item');
const item = (page: Page, title: string) => items(page).filter({ hasText: title });

test.beforeEach(async ({ page }) => {
    await page.goto(APP);
    const input = page.getByPlaceholder('What needs to be done?');
    for (const todo of SEED) {
        await input.fill(todo.title);
        await input.press('Enter');
        if (todo.completed) await item(page, todo.title).getByRole('checkbox').check();
    }
    await expect(items(page)).toHaveCount(SEED.length);
});

test('seeded list is shown and persisted as entered', async ({ page }) => {
    await expect(items(page)).toHaveText(SEED.map(t => t.title));
    await expect(page.getByTestId('todo-count')).toHaveText(`${OPEN.length} items left`);
    expect((await stored(page)).map(({ title, completed }) => ({ title, completed }))).toEqual(SEED);
});

test('filters show the right subset and keep it in the URL', async ({ page }) => {
    await page.getByRole('link', { name: 'Active' }).click();
    await expect(page).toHaveURL(/#\/active$/);
    await expect(items(page)).toHaveText(OPEN.map(t => t.title));

    await page.getByRole('link', { name: 'Completed' }).click();
    await expect(items(page)).toHaveText(DONE.map(t => t.title));

    // A filtered view is a URL a user can bookmark: reloading it keeps the filter and the data.
    await page.reload();
    await expect(items(page)).toHaveText(DONE.map(t => t.title));
    await expect(page.getByRole('link', { name: 'Completed' })).toHaveClass('selected');
});

test('editing commits on Enter, cancels on Escape, and an empty title deletes', async ({ page }) => {
    const [first, second, third] = OPEN;

    await item(page, first.title).dblclick();
    await item(page, first.title).getByRole('textbox', { name: 'Edit' }).fill(`${first.title} (urgent)`);
    await page.keyboard.press('Enter');
    await expect(item(page, `${first.title} (urgent)`)).toBeVisible();

    await item(page, second.title).dblclick();
    await item(page, second.title).getByRole('textbox', { name: 'Edit' }).fill('this must not be saved');
    await page.keyboard.press('Escape');
    await expect(item(page, second.title)).toBeVisible();
    await expect(page.getByText('this must not be saved')).toHaveCount(0);

    await item(page, third.title).dblclick();
    await item(page, third.title).getByRole('textbox', { name: 'Edit' }).fill('');
    await page.keyboard.press('Enter');
    await expect(item(page, third.title)).toHaveCount(0);

    const titles = (await stored(page)).map(t => t.title);
    expect(titles).toContain(`${first.title} (urgent)`);
    expect(titles).toContain(second.title);
    expect(titles).not.toContain(third.title);
    expect(titles).toHaveLength(SEED.length - 1);
});

test('complete all, then clear completed, empties the list for good', async ({ page }) => {
    await page.getByLabel('Mark all as complete').check();
    await expect(page.getByTestId('todo-count')).toHaveText('0 items left');
    expect((await stored(page)).every(t => t.completed)).toBe(true);

    await page.getByRole('button', { name: 'Clear completed' }).click();
    await expect(items(page)).toHaveCount(0);
    // With nothing left the footer and toggle disappear rather than showing "0 items left".
    await expect(page.getByTestId('todo-count')).toBeHidden();

    await page.reload();
    await expect(items(page)).toHaveCount(0);
    expect(await stored(page)).toEqual([]);
});

test('a second tab sees the same list after it loads', async ({ page, context }) => {
    // localStorage is shared per origin within a context, like two tabs of one browser.
    const tab = await context.newPage();
    await tab.goto(APP);
    await expect(items(tab)).toHaveText(SEED.map(t => t.title));
    await expect(tab.getByTestId('todo-count')).toHaveText(`${OPEN.length} items left`);
    await tab.close();
});
