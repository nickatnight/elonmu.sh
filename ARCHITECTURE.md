# Architecture

elonmu.sh is an Express 4 app with server-rendered EJS views and no frontend
bundler. Bun runs the TypeScript directly.

## App

- `src/index.ts` starts the server and warms the jet cache. `src/app.ts`
  exports `createApp({ jet, services })`, so tests can inject fakes and start
  the app on a random port with `startTestServer` (`tests/helpers.ts`).
- Each module in `src/routes/` exports `register(app, ...)`. When an upstream
  (NewsAPI, Bluesky) fails, the route returns **200 with `{ error }`** through
  `upstreamFailure()`. Only our own bugs return 500. The README documents
  this contract.
- `src/catalog.ts` (`SERVICES`) lists the public tools. The nav and the home
  page's service cards are rendered from it.
- Static files are served with a one-year cache. Templates link them through
  `asset('static/...')`, which appends a hash of the file's contents.
- `src/middleware/security-headers.ts` sets a strict CSP (`script-src 'self'`,
  no inline scripts or styles). The vendored globe.gl injects `<style>` tags
  at runtime, which are allowed by sha256 hash. Upgrading globe.gl means
  recomputing those hashes.

## Jet tracker (`src/jet/`)

The tracker uses ports and adapters. `ports.ts` defines `FlightSource`,
`PlaceResolver`, `JetQuery`, `Clock`, `HttpGet` and `Logger`.
`createJetModule()` in `index.ts` is the only place that wires real adapters:

```
BlueskyFlightSource → CachedFlightSource (5 min TTL, serves stale on error) → JetService → JetQuery
```

- `sources/bluesky/` reads @elonjet.net's posts. `feed-client` pages through
  the feed, `parse` turns posts into events, and `pair` joins each takeoff to
  its landing to make a flight. Fuel replies add the cost and CO₂.
- Place names resolve against a static gazetteer, `places/places.json`, so
  nothing is geocoded at request time. When the server logs
  "jet: unknown place", run `scripts/geocode-places.ts` to add the missing
  places.
- Every `FlightSource` must satisfy the contract documented in `ports.ts`.
  `tests/jet/flight-source.contract.ts` (`describeFlightSource`) enforces it
  for each source. `tests/jet/fakes.ts` provides `FakeClock`,
  `InMemoryFlightSource` and the `flight()` builder.
- `format.ts` builds the `/jet` page model. `teaser.ts` and `projection.ts`
  build the home page's globe teaser, an SVG the server draws. The teaser's
  Earth image (`teaser-earth.webp`) is pre-rendered by
  `scripts/render-teaser-earth.ts` from the same `TEASER_VIEW` and
  `TEASER_SIZE`. A test checks that they match.
- On the client, `src/public/static/js/jet.js` is a vanilla ES module with
  JSDoc types. It is typechecked through `allowJs` and unit-tested in
  `tests/jet/scene.test.ts`. It lazy-loads the vendored globe.gl and fetches
  `/api/jet/flights`.
- `tests/jet/budgets.test.ts` caps the size of the vendored script and the
  globe images.
