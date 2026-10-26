# Real-world samples

Multi-step checks against live public sites, one folder per scenario. Each folder has a Playwright
Test spec and a pytest file that cover the same site from different angles; `site-health` adds a
plain script and a JSON flow. All of them pass through the runner as written.

| Folder | Site | What it exercises |
| --- | --- | --- |
| `demoblaze-purchase` | [Demoblaze](https://www.demoblaze.com) | Categories that list only their own products, product page prices that match the catalog, cart totals checked against our own sum (including after a delete and a reload), order form validation, and a receipt whose amount matches the cart. In Python, one test per order in `data/orders.json`, including one refused for having no card |
| `demoblaze-multi-user` | Demoblaze | Two shoppers with fresh accounts in isolated contexts: per-account server-side carts that never leak to the other shopper and follow their owner to a new device, logout, and the account rules (duplicate sign-up, wrong password, unknown user) |
| `booking-api` | [Restful-booker](https://restful-booker.herokuapp.com) | API only, no page: token and basic auth, a create/read/search/put/patch/delete lifecycle, refused writes, rejected payloads (one known defect marked `xfail(strict=True)`), date-range search, and cleanup in teardown |
| `site-health` | [playwright.dev](https://playwright.dev) | Synthetic monitoring: Navigation Timing budgets, console errors, failed first-party requests, a link check, SEO basics, and a search journey. `docs-journey.ts` (plain script) and `docs-search.json` (JSON flow) run as the runner's own collection types |
| `todo-app-state` | [TodoMVC](https://demo.playwright.dev/todomvc) | State seeded from `data/todos.csv` and checked in both the UI and `localStorage`: filters that survive a reload, editing (commit, cancel, delete), and bulk actions. In Python, state is preloaded with an init script instead of being typed in |
| `marketplace-readonly` | Amazon.in, Flipkart | **Manual-run only, never scheduled.** Read-only journeys on real marketplaces: search relevance, price sort, a guest cart round-trip on Amazon, and Flipkart's displayed price checked against its schema.org data. A bot challenge skips the test rather than failing it. See the folder's README |
| `network-resilience` | Demoblaze | `page.route` scenarios: a rewritten live response, injected latency, a 503 outage with recovery, and blocked images and analytics. In Python, a HAR is recorded and replayed with the API cut off, and a guard checks that one category click makes exactly one API call |

## Running

```bash
npm run test:real-world/purchase          # or any of the scripts named test:real-world/* in package.json

# by hand
asm-playwright-runner samples/real-world/demoblaze-purchase/purchase-python.py \
  --dataDir samples/real-world/demoblaze-purchase/data -r result-purchase-py
```

The data-driven files read their data from `ASM_DATA_DIR`, so pass `--dataDir`. Without it they fall
back to the `data` folder beside the script.

## Credentials

The Demoblaze checks create their own accounts on every run, so they need none. The others use the
site's **published demo account**, and each value can be overridden without editing the script.
The variable names are chosen so their values are redacted from the trace model:

| Variables | Used by |
| --- | --- |
| `SHOPPER_PASSWORD` | `demoblaze-multi-user` (password for the accounts it creates) |
| `BOOKER_USER`, `BOOKER_PASSWORD` | `booking-api` |
| `SITE_URL`, `BUDGET_TTFB_MS`, `BUDGET_DCL_MS`, `BUDGET_LOAD_MS` | `site-health` (budgets in ms) |
| `LATENCY_BUDGET_MS` | `booking-api` |

## Running on check agents

These run as Apica Playwright checks too, and the agents differ from a laptop in ways the scripts
allow for:

- **No Cloudflare-protected targets.** These samples used to use Practice Software Testing's Toolshop,
  which sits behind Cloudflare bot protection. Cloudflare challenges the agents' datacenter IPs
  before the page loads, so every test timed out. Demoblaze has no such protection.
- **Chromium runs with `--disable-dev-shm-usage`.** Agents run the browser in containers with a small
  `/dev/shm`, where image-heavy pages crash the renderer (`Page crashed`, `Target crashed`).
- **Product images are blocked in the Demoblaze flows.** They are several MB per page, and on a
  constrained agent the browser ran out of resources and dropped API calls
  (`net::ERR_INSUFFICIENT_RESOURCES`). Nothing these flows check depends on images.
- **Actions get at most 10 seconds** on the agents, waits for a response included. Every file here
  passes with `--actionTimeout 10000`.

## Things these sites do that a check has to handle

Some of this behaviour is deliberate on these demo sites. The checks assert it rather than working
around it:

- **Demoblaze reports with `window.alert()`.** Some alerts fire inside the click itself (order form
  validation), so the alert is accepted from an event handler. A helper that waits for the click
  first would deadlock.
- **Demoblaze draws cart rows one at a time,** each after its own `/view` call, so cart assertions
  allow up to 15 seconds. The `/deletecart` call that empties the cart after an order has to finish
  before the cart is checked.
- **Demoblaze's add-to-cart alert differs between guests and logged-in users:** "Product added" for a
  guest, "Product added." with a full stop for a logged-in user.
- **Restful-booker stores a non-numeric `totalprice` as `null`** instead of rejecting it. The test for
  that is a strict `xfail`, so it turns red when the API is fixed.
- **Third-party sites answer automated clients with 401/403/429** (X and Stack Overflow do). The link
  check is strict for first-party links only; for third-party links it counts only 404, 410, 5xx or
  no answer.
