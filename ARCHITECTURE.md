# Architecture

elonmu.sh is an Express 4 app with server-rendered EJS views and no frontend
bundler. Bun runs the TypeScript directly.

## App

- `src/index.ts` starts the server and warms the jet cache. `src/app.ts`
  exports `createApp({ jet, hype, services })`, so tests can inject fakes and
  start the app on a random port with `startTestServer` (`tests/helpers.ts`).
- Each module in `src/routes/` exports `register(app, ...)`. When an upstream
  (NewsAPI, Bluesky, Wikimedia) fails, the route returns **200 with `{ error }`** through
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

## Shared ports and cache

- `src/ports.ts` defines the ports every module uses: `Clock`, `HttpGet` and
  `Logger`. Only a composition root (`src/jet/index.ts`, `src/hype/index.ts`)
  builds the real ones.
- `src/cache/cached-value.ts` is a keyed TTL cache, `CachedValue<T>`. It
  shares one in-flight load between concurrent callers. When a load fails it
  serves the last good value and logs the `stale` message, or logs the
  `empty` message and throws if there is nothing to serve. Callers pass in
  both messages. By default a value is only served stale for its own key;
  `staleAcrossKeys` lets a new key fall back to the previous key's value.
- `tests/fakes.ts` provides `FakeClock`, `FakeLogger` and `fakeHttpGet`.

## Jet tracker (`src/jet/`)

The tracker uses ports and adapters. `ports.ts` defines `FlightSource`,
`PlaceResolver` and `JetQuery`. `createJetModule()` in `index.ts` is the only
place that wires real adapters:

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
- `CachedFlightSource` keeps a `CachedValue` keyed by the start of the year,
  without `staleAcrossKeys`, so last year's flights are never served for a new
  year.
- Every `FlightSource` must satisfy the contract documented in `ports.ts`.
  `tests/jet/flight-source.contract.ts` (`describeFlightSource`) enforces it
  for each source. `tests/jet/fakes.ts` provides `InMemoryFlightSource`, the
  `flight()` builder and `sampleJet()`.
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

## Hype meter (`src/hype/`)

Daily views of the English Wikipedia article "Elon Musk", from Wikimedia's
pageview API. Same layout as the jet tracker: `ports.ts` defines
`PageviewSource` and `HypeQuery`, and `createHypeModule()` in `index.ts` is
the only place that wires real adapters:

```
WikimediaPageviewSource → CachedPageviewSource (4 h TTL, stale across keys) → HypeService → HypeQuery
```

- `createHypeModule()` builds its own `HttpGet` from `axios.get` with a 10 s
  timeout and the `User-Agent` Wikimedia's API policy asks for
  (`elonmu.sh/<version> (https://github.com/nickatnight/elonmu.sh)`). A 404
  for the range is an upstream failure like any other.
- `sources/wikimedia/parse.ts` turns the API's `items` into `DayViews`
  (`{ date: 'YYYY-MM-DD', views }`), ascending and de-duplicated. Days
  Wikimedia leaves out stay missing; nothing is zero-filled. No Wikimedia
  field reaches `domain.ts` or the JSON.
- `CachedPageviewSource` keys its `CachedValue` by the window's last day,
  which changes at midnight UTC. `staleAcrossKeys` is on, so if Wikimedia
  fails just after midnight, yesterday's series is served instead of an
  error.
- `HypeService` asks for the 365 days ending yesterday (UTC) and computes the
  stats (total, median, peak) and the top 5 spikes, each at least 7 days from
  any bigger one. `from` and `to` come from the days actually returned.
- Every `PageviewSource` must satisfy the contract documented in `ports.ts`.
  `tests/hype/pageview-source.contract.ts` (`describePageviewSource`) enforces
  it for each source, the Wikimedia one through `fakeHttpGet` and the real
  capture in `tests/fixtures/wikimedia-pageviews.json`.
- `chart.ts` is a pure function from the series to seismograph geometry for a
  wide (720) and a narrow (360) frame: a log₂ scale of views over the median
  from ½× to the next power of two at or above the peak (at least 4×), one
  path per colour for the needles, month ticks and stacked spike labels.
  `format.ts` builds the `/hype` page model from it, like jet's `format.ts`.
- `/hype` is server-rendered inline SVG with no client JS. The SVG uses
  presentation attributes and classes, never `style=""`, so the CSP is
  unchanged. Its rules live in `hype.css` (`.hype*`), which the home page
  never loads; `tests/hype/page.test.ts` enforces that and a 60 KB HTML
  budget.
