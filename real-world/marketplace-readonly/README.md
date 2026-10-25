# Marketplace read-only samples (Amazon.in, Flipkart)

> **Manual-run only. Do not schedule these as recurring checks.**
> Amazon's Conditions of Use and Flipkart's Terms of Use do not allow automated access. These
> samples show what a read-only journey on a large real marketplace looks like. They never log in,
> never check out, and leave the guest cart as they found it.

| File | Journey |
| --- | --- |
| `amazon.spec.ts` | Search relevance and prices, price sort (sponsored slots excluded), and a guest add-to-cart, check, then remove |
| `flipkart.spec.ts` | Search relevance and prices, price sort that is kept in the URL and survives a reload, and the price on the product page matching the schema.org price the page publishes to search engines |

```bash
asm-playwright-runner samples/real-world/marketplace-readonly/flipkart.spec.ts -r result-flipkart
# another product: --envVars SEARCH_TERM="usb keyboard" SEARCH_KEYWORD=keyboard
```

## Bot challenges skip instead of failing

Both sites answer automated clients with a 503 page, a CAPTCHA or a "continue shopping" gate, and
the more often they are run from one IP, the more often that happens. The samples:

- click through Amazon's "continue shopping" gate, as a person would;
- **skip** the test, with the reason recorded, when they are served a CAPTCHA or a 503. A refused
  bot is not a site outage, and a run with skips still exits `0`.

When these were written, search and sort passed on both sites. After a few runs from the same IP,
Amazon started serving a CAPTCHA on product pages, so its cart test skips there.

## Why the selectors look the way they do

- **Amazon:** stable ids (`#productTitle`, `#add-to-cart-button`, `#nav-cart-count`) and
  `data-component-type="s-search-result"` cards. Products are opened by clicking, because a cold
  visit to a product URL is what most often draws a CAPTCHA.
- **Flipkart:** class names are generated and change between releases, so none are used. Cards are
  `div[data-id]` with a `/p/` link, prices are found by the `₹` sign, and product facts come from the
  page's `application/ld+json`.
- **Prices are never hardcoded,** and neither are products. Each run checks the site against itself:
  sort order, and the displayed price against the published one.

Flipkart's guest add-to-cart is left out on purpose: during probing it registered on some runs and
not others, and a check that is flaky by design teaches the wrong lesson.
