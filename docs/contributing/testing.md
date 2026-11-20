# Testing Guide

spieli has two test layers: unit tests in the frontend and Playwright end-to-end (E2E) tests for the full app.

## Running tests

```bash
make test          # unit tests + Playwright E2E
make test-unit     # unit tests only (fast, no browser)
```

E2E tests need no Docker stack and no data. Playwright builds the app and serves it with `vite preview` on `http://localhost:4173` (`playwright.config.js`), and every API response is stubbed in the browser (see [Key test helpers](#key-test-helpers-testshelpersjs)).

CI runs both layers automatically on every pull request (`e2e.yml` + the `build-app` gate in `build.yml`).

---

## Unit tests

Unit tests live next to the module they test, suffixed `.test.js`, in `app/src/lib/`, `app/src/stores/` and `app/src/hub/`:

```
app/src/lib/completeness.test.js
app/src/stores/filters.test.js
app/src/hub/registryEntry.test.js
```

`make test-unit` runs `npm --prefix app run test:unit`, which is an explicit chain of `node <file>` calls in `app/package.json`. They are pure Node.js (no bundler, no browser) and run in seconds. One file can be run on its own:

```bash
node app/src/lib/completeness.test.js
```

### Writing a new unit test

Add a `*.test.js` file next to the module under test and use `node:assert/strict`:

```js
import assert from 'node:assert/strict';
import { playgroundCompleteness } from './completeness.js';

assert.equal(playgroundCompleteness({ device_count: 1, surface: 'sand' }), 'complete');
```

Then append it to the `test:unit` chain in `app/package.json`; a file that is not in the chain never runs. Tests that import Svelte stores need `node --conditions=node …`, as the existing store tests show. The `Makefile` needs no change.

---

## Playwright E2E tests

Tests live in `tests/`, one area of the app per file. Some examples (there are about 40):

| File | What it tests |
|---|---|
| `smoke.spec.js` | Page load, canvas visible, title |
| `tiered.spec.js` | Cluster/polygon tier RPC selection by zoom |
| `selection.spec.js` | Playground click → panel open, hash written |
| `hash-restore.spec.js` | Deep link restore on page load (`#W<osm_id>`) |
| `hub-smoke.spec.js` | Hub mode basic page load |
| `hub-multi-backend.spec.js` | Hub fan-out to multiple backends, cross-backend cluster merge |
| `hub-deeplink.spec.js` | Hub deep link with backend slug (`#<slug>/W<osm_id>`) |
| `hub-pill.spec.js` | Instance pill count display |
| `hub-federation-health.spec.js` | federation-status.json polling and stale banner |
| `hub-osm-id-dedup.spec.js` | Cross-backend duplicate osm_id deduplication |
| `cluster-position.spec.js` | Cluster bucket positions reflect member centroids |
| `osmIdDedup.spec.js` | `osmIdDedup` logic (unit-style via page evaluate) |
| `xss.spec.js` | Injection safety: OSM tag values rendered as text, not HTML |

### Key test helpers (`tests/helpers.js`)

The two used by almost every test:

**`injectApiConfig(page, overrides?)`**

Intercepts the `config.js` request and injects a stub `window.APP_CONFIG`. Default values: `apiBaseUrl: '/api'`, `clusterMaxZoom: 0` (polygon-only to keep other suites isolated from the cluster path). Pass overrides to test specific config scenarios:

```js
await injectApiConfig(page, { clusterMaxZoom: 13, mapZoom: 12 });
```

**`stubApiRoutes(page)`**

Intercepts the `/api/rpc/*` requests the map makes and answers them in the browser: the playground fixture (`tests/fixtures/playground.json`, or a FeatureCollection you pass) for `get_playgrounds*` and `get_playground`, one cluster bucket covering all of them for `get_playground_clusters` (or the array you pass), and empty results for equipment, trees and POIs. No database or server is involved.

For hub tests, `injectHubConfig`, `stubHubRegistry` and `stubFederationStatus` do the same for the hub's config, `registry.json` and `federation-status.json`; `makePlayground` builds a single fixture feature.

### Running a single test file

```bash
npx playwright test tests/smoke.spec.js
```

### Running with a UI (headed mode)

```bash
npx playwright test --ui
```

### Updating fixtures

There is one static fixture, `tests/fixtures/playground.json` (a FeatureCollection of playgrounds). Every other response is built in `tests/helpers.js` or in the test itself. When an API response shape changes (see [API reference](../reference/api.md)), update the fixture and the stubs in `helpers.js` together.

### Writing a new E2E test

1. Create `tests/mynewfeature.spec.js`.
2. Use `injectApiConfig` and `stubApiRoutes` in `beforeEach` to isolate from network + config.
3. Override specific routes as needed:

```js
import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

test.describe('My feature', () => {
  test.beforeEach(async ({ page }) => {
    await injectApiConfig(page);
    await stubApiRoutes(page);
  });

  test('does the thing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.my-element')).toBeVisible();
  });
});
```

4. To test a 404 fallback, override the stubbed route after `stubApiRoutes`:

```js
await stubApiRoutes(page);
await page.route('**/rpc/get_playground_clusters**', route =>
  route.fulfill({ status: 404, body: '{}' })
);
```

Playwright processes the most-recently-registered handler first, so the override takes precedence.

---

## CI behaviour

| Trigger | Tests run |
|---|---|
| Pull request against `main` | Build gate + Playwright E2E |
| Push to `main` | Build gate + Playwright E2E |
| Push of `v*` tag | Build gate only (no E2E) — the commit was already tested when it landed on `main` |

Failed E2E runs upload a Playwright HTML report as a CI artefact (30-day retention).
