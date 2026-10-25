# Real-world samples

Multi-step checks against live public sites, one folder per scenario. Each folder has a Playwright
Test spec and a pytest file that cover the same site from different angles; `site-health` adds a
plain script and a JSON flow. All of them pass through the runner as written.

| Folder | Site | What it exercises |
| --- | --- | --- |
| `toolshop-purchase` | [Toolshop](https://practicesoftwaretesting.com) | Search and sort checks, cart arithmetic checked against prices read from the page, a per-product quantity limit, checkout with an address from the postcode lookup, and an invoice that must match the cart. In Python, one test per payment method from `data/payments.json`, including an expired card that has to be refused |
| `support-ticket-multi-user` | Toolshop | A customer and an admin in two isolated contexts: the customer files a ticket, the admin triages and answers it, and the customer sees the reply and the new status. Also covers guest form validation and the admin route guard |
| `booking-api` | [Restful-booker](https://restful-booker.herokuapp.com) | API only, no page: token and basic auth, a create/read/search/put/patch/delete lifecycle, refused writes, rejected payloads (one known defect marked `xfail(strict=True)`), date-range search, and cleanup in teardown |
| `site-health` | [playwright.dev](https://playwright.dev) | Synthetic monitoring: Navigation Timing budgets, console errors, failed first-party requests, a link check, SEO basics, and a search journey. `docs-journey.ts` (plain script) and `docs-search.json` (JSON flow) run as the runner's own collection types |
| `todo-app-state` | [TodoMVC](https://demo.playwright.dev/todomvc) | State seeded from `data/todos.csv` and checked in both the UI and `localStorage`: filters that survive a reload, editing (commit, cancel, delete), and bulk actions. In Python, state is preloaded with an init script instead of being typed in |
| `network-resilience` | Toolshop | `page.route` scenarios: a rewritten live response, injected latency, a 503 outage with recovery, and blocked images and analytics. In Python, a HAR is recorded and replayed with the API cut off, and a guard checks that one search makes exactly one API call |

## Running

```bash
npm run test:real-world/purchase          # or any of the scripts named test:real-world/* in package.json

# by hand
asm-playwright-runner samples/real-world/toolshop-purchase/purchase-python.py \
  --dataDir samples/real-world/toolshop-purchase/data -r result-purchase-py
```

The data-driven files read their data from `ASM_DATA_DIR`, so pass `--dataDir`. Without it they fall
back to the `data` folder beside the script.

## Credentials

Every login uses the site's **published demo account**. Each one can be overridden without editing
the script, and the variable names are chosen so their values are redacted from the trace model:

| Variables | Used by |
| --- | --- |
| `TOOLSHOP_EMAIL`, `TOOLSHOP_PASSWORD` | `toolshop-purchase` |
| `CUSTOMER_EMAIL`, `CUSTOMER_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `support-ticket-multi-user` |
| `BOOKER_USER`, `BOOKER_PASSWORD` | `booking-api` |
| `SITE_URL`, `BUDGET_TTFB_MS`, `BUDGET_DCL_MS`, `BUDGET_LOAD_MS` | `site-health` (budgets in ms) |
| `LATENCY_BUDGET_MS` | `booking-api` |

## Things these sites do that a check has to handle

These are shared public demo sites, and some of their behaviour is deliberate. The checks assert it
rather than working around it:

- **Toolshop resets its database regularly** (about once an hour). Product and user ids change when it
  does, so nothing here hardcodes an id: products are found by name. A run that overlaps a reset can
  fail once.
- **Toolshop refuses an invoice whose city does not match its country** (`422`), and the UI shows no
  error; the Confirm button just does nothing. The checkout therefore takes its address from the
  shop's postcode lookup and asserts that the form shows what the lookup returned.
- **Some products are capped at one per cart** ("You can only have one Thor Hammer in the cart.").
- **Replying to a ticket moves it back to `IN_PROGRESS`**, so a ticket has to be resolved after the
  reply, not before.
- **Restful-booker stores a non-numeric `totalprice` as `null`** instead of rejecting it. The test for
  that is a strict `xfail`, so it turns red when the API is fixed.
- **Third-party sites answer automated clients with 401/403/429** (X and Stack Overflow do). The link
  check is strict for first-party links only; for third-party links it counts only 404, 410, 5xx or
  no answer.
