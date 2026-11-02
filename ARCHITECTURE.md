# Architecture

elonmu.sh is an Express 4 app with server-rendered EJS views and no frontend
bundler. Bun runs the TypeScript directly.

## App

- `src/index.ts` starts the server and warms the jet and Starlink caches
  through `warmUpCaches()` (`src/warm-up.ts`), passing it `process.env`. It
  skips the Starlink warm-up when `SKIP_STARLINK_WARM_UP` is `1`, which
  `bun run dev` sets. `tests/index.test.ts` tests it and the two scripts.
  `src/app.ts` exports `createApp({ jet, hype, doge, news, starlink,
  services })`, so tests can inject fakes and start the app on a random port
  with `startTestServer` (`tests/helpers.ts`).
- Any module a test leaves out is the real one. A test that follows nav links
  or card links must pass a fake for every page it reaches, or it calls the
  real upstream. `tests/jet/page.test.ts` passes `sampleStarlink()` for this
  reason.
- Each module in `src/routes/` exports `register(app, ...)`. When an upstream
  (NewsAPI, Bluesky, Wikimedia, CoinGecko, CelesTrak) fails, the route
  returns **200 with `{ error }`** through `upstreamFailure()`. Only our own
  bugs return 500. The README documents this contract.
- `src/catalog.ts` (`SERVICES`) lists the public tools. Each entry has a page
  (`href`) and an endpoint (`api`); its id is also its block's anchor on
  `/docs`. The nav, the home page's service cards, and the endpoint links on
  `/docs` and each service page are rendered from it. The nav's Docs link is
  hard-coded after the services, because `/docs` is not a service.
- The topbar (`partials/topbar.ejs`) carries the GitHub "fork me" ribbon on
  every page: pure CSS, sized by the `--ribbon` `clamp()` token. Only the
  band takes clicks. The nav has `padding-inline-end` derived from
  `--ribbon` so no link runs under the band. Below 520 px (32.49rem) the
  brand shows only its icon, and the name stays for screen readers, because
  the brand, six links and a readable band don't fit in one bar there.
  The brand never shrinks (`flex-shrink: 0`). Instead, the nav text and gaps
  shrink with the viewport through `clamp()`, to 11.5 px text and 4.8 px gaps
  at 320 px, and reach full size at 400 px. A seventh link will need another
  look at 320 px.
- Static files are served with a one-year cache. Templates link them through
  `asset('static/...')`, which appends a hash of the file's contents.
- `src/middleware/security-headers.ts` sets a strict CSP (`script-src 'self'`,
  no inline scripts or styles). The vendored globe.gl injects `<style>` tags
  at runtime, which are allowed by sha256 hash. Upgrading globe.gl means
  recomputing those hashes.

## Shared ports and cache

These began in `src/jet/` and moved out when the hype meter became the second
module that needed them (spec Decision 5). There was no copy per module and
no re-export shim. The jet cache's tests passed with only their imports
changed, which shows the move kept its behaviour.
- `src/ports.ts` defines the ports every module uses: `Clock`, `HttpGet` and
  `Logger`. Only a composition root (`src/jet/index.ts`, `src/hype/index.ts`,
  `src/doge/index.ts`, `src/news/index.ts`) builds the real ones.
- `src/cache/cached-value.ts` is a keyed TTL cache, `CachedValue<T>`. It
  shares one in-flight load between concurrent callers. When a load fails it
  serves the last good value and logs the `stale` message, or logs the
  `empty` message and throws if there is nothing to serve. Callers pass in
  both messages. By default a value is only served stale for its own key;
  `staleAcrossKeys` lets a new key fall back to the previous key's value.
  Jet leaves it off, so last year's flights are never served for a new year.
  Hype turns it on, because its key is a day that changes at midnight UTC.
  `retryAfterMs` is opt-in: after a failed load, no new load starts for that
  long, whatever the key, and callers get the fallback (or the same error)
  without a new warning. Jet leaves it unset, so every miss while Bluesky is
  down tries again. Hype, DOGE and news set it to a minute. It can also be
  a function of the failed load's error, so the wait can depend on how the
  upstream failed: Starlink waits 2 hours after a refusal and a minute
  after anything else.
- `tests/fakes.ts` provides `FakeClock`, `FakeLogger` and `fakeHttpGet`.

## News roulette (`src/news/`)

One random news article about Elon Musk from NewsAPI, as a page (`/news`)
and as JSON (`/api/news`). Same layout as the other modules: `ports.ts`
defines `ArticleSource` and `NewsQuery`, and `createNewsModule()` in
`index.ts` is the only place that wires axios, `NEWS_API_KEY`, the clock and
`Math.random`:

```
NewsApiArticleSource → CachedArticleSource (15 min TTL, one key, 1 min retry) → NewsService → NewsQuery
```

- `createNewsModule()` gives axios a 10 s timeout. It turns an `AxiosError`
  into a `NewsUpstreamError` whose `failure` is `error-response`,
  `no-response` or `not-sent`, so nothing past the composition root sees
  axios. `src/routes/news.ts` maps each failure to the error body
  `/api/news` has always sent, through a lookup table. Any other error is a
  500.
- `sources/newsapi/parse.ts` turns NewsAPI's `articles` into `Article`s
  (`source`, `title`, `description`, `url`, `urlImage`, `publishDate`).
  NewsAPI field names (`urlToImage`, `publishedAt`, `source.name`) stay in
  the adapter. An article missing a required string is skipped. A body with
  no usable article throws, so an empty page is never cached.
- `CachedArticleSource` caches NewsAPI's latest page. `NewsService` picks
  one article per request with an injected `Math.random`, so responses vary
  while NewsAPI is called at most once per 15 minutes when healthy and once
  a minute while it fails.
- Every `ArticleSource` must satisfy the contract in `ports.ts`.
  `tests/news/article-source.contract.ts` (`describeArticleSource`) runs it
  on the NewsAPI source (through `fakeHttpGet`), on `InMemoryArticleSource`
  and on `CachedArticleSource`. Tests pass `createApp({ news })` a fake;
  none spies on axios.
- `format.ts` builds the `/news` page model. The image and the article link
  are kept only if they are `https:` URLs. `/news` renders the article on
  the server with no script, sends `Cache-Control: no-store`, and shows an
  unavailable note with a 200 when NewsAPI fails. Its rules live in
  `news.css` (`.news*`).

## API docs (`/docs`)

`src/routes/docs.ts` renders `src/views/docs.ejs`: one block per endpoint, in
catalog order, then `#errors` with the status rules and a cache table.
- The example responses live in `src/docs/examples.ts`, typed against each
  module's domain types, so a renamed field fails the typecheck.
  `tests/docs.test.ts` also compares every documented key path with a real
  response from the fakes. Long arrays are trimmed in the examples, and
  the page says so.
- The examples are tokenized on the server by `tokenize` from
  `src/public/static/js/console.js` and printed through
  `partials/json.ejs` with `<%= %>`. That is the same one-module-for-both
  pattern as `doge.js`, so `console.js` must not touch the DOM at module
  top level; its only top-level browser call is `start()`, behind
  `typeof document !== 'undefined'`.
- `console.js` is the only script on `/docs`. It holds `tokenize`, `trim`
  (arrays to their first 3 items plus `… N more`), and two starters with
  injected dependencies:
  - `startSend` fetches the block's `data-api` (from `SERVICES`, through
    `partials/docs-response.ejs`), swaps the static example for the
    trimmed live response, and shows "Full response ↗". Before each render
    it sets the `<pre>`'s `minHeight` to the tallest height it has had, so
    a short `{ error }` body doesn't shrink the box.
  - `startCopy` copies the static example, or after Send the full live
    response (`JSON.stringify(body, null, 2)`, kept on the `<pre>` as
    `data-full-response`), never the trimmed preview.
- `tests/docs-copy.test.ts` tests both starters with `EventTarget` fakes.
  Send and Copy are rendered `hidden` and shown by the script, so without
  JS the static examples stand alone. `tests/docs.test.ts` holds
  `console.js` to 7 KB.
- `/docs`-only rules (`.doc*`, `.code*`, `.fields`, `.illus`, `.tok-*`) live
  in `docs.css`, which the home page never loads.

## Home page

Hero, services, jet teaser, testimonials, footer. It loads `main.js` (the
scroll reveal), `hero.js` and `legacy-anchors.js`, and never `console.js`,
`docs.css`, globe.gl or `jet.js`.
- Each service card is an `<article>`. The name links to the service page,
  and that link is stretched over the card with `::after`. The footer row is
  a second link, to the service's `/docs` block, sitting above the stretched
  link.
- The API reference used to live on the home page. Fragments never reach
  the server, so `legacy-anchors.js` exports a pure `docsTarget(hash)` and
  sends `/#get-api` to `/docs#news-api` and `/#errors` to `/docs#errors`
  with `location.replace()`, so Back skips the dead URL. It is a file, not
  an inline script, so the CSP is unchanged.

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
  JSDoc types, which tsc does not check (no `checkJs`). It is unit-tested in
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
WikimediaPageviewSource → CachedPageviewSource (4 h TTL, stale across keys, 1 min retry) → HypeService → HypeQuery
```

- `createHypeModule()` builds its own `HttpGet` from `axios.get` with a 10 s
  timeout, a 1 MB response cap, no redirects, and the `User-Agent`
  Wikimedia's API policy asks for
  (`elonmu.sh/<version> (https://github.com/nickatnight/elonmu.sh)`). A 404
  for the range is an upstream failure like any other.
- `sources/wikimedia/parse.ts` turns the API's `items` into `DayViews`
  (`{ date: 'YYYY-MM-DD', views }`), ascending and de-duplicated. Days
  Wikimedia leaves out stay missing; nothing is zero-filled. A view count
  that is not a non-negative safe integer rejects the whole response. No
  Wikimedia field reaches `domain.ts` or the JSON.
- `CachedPageviewSource` keys its `CachedValue` by the window's last day,
  which changes at midnight UTC. `staleAcrossKeys` is on, so if Wikimedia
  fails just after midnight, yesterday's series is served instead of an
  error. After a failure it waits a minute (`retryAfterMs`) before asking
  Wikimedia again, so a client looping on `/hype` during an outage makes
  one upstream call a minute.
- `HypeService` asks for the 365 days ending yesterday (UTC) and computes the
  stats (total, median, peak) and the top 5 spikes, each at least 7 days from
  any bigger one. The median is rounded to whole views, and `timesMedian` is
  measured against that rounded value. `from` and `to` come from the days
  actually returned.
- Every `PageviewSource` must satisfy the contract documented in `ports.ts`.
  `tests/hype/pageview-source.contract.ts` (`describePageviewSource`) enforces
  it for each source, the Wikimedia one through `fakeHttpGet` and the real
  capture in `tests/fixtures/wikimedia-pageviews.json`.
- `chart.ts` is a pure function from the series to seismograph geometry for a
  wide (720) and a narrow (360) frame: a log₂ scale of views over the median
  from ½× to the next power of two at or above the peak (at least 4×), one
  path per colour for the needles, month ticks and spike labels.
  `format.ts` builds the `/hype` page model from it, like jet's `format.ts`.
- Spike labels are placed highest spike first. A label that would overlap an
  earlier label, or cover another spike's dot, moves up and gets a leader
  line down to its own dot. The overlap maths assumes the chart's
  `fontSize`. The view prints that value as the SVG's `font-size` attribute,
  so `hype.css` must not set a `font-size` on chart text; a page test checks
  this.
- `/hype` is server-rendered inline SVG with no client JS. The SVG uses
  presentation attributes and classes, never `style=""`, so the CSP is
  unchanged. Its rules live in `hype.css` (`.hype*`), which the home page
  never loads; `tests/hype/page.test.ts` enforces that and a 60 KB HTML
  budget.
- Below 48rem the page swaps to the narrow chart and stacks the stats. The
  spike rows (date, views, multiplier) share columns through `subgrid`, and
  only stack below 30rem. A page test checks which rules sit in each media
  query. The stats row and the spike list share a 50rem cap; the chart
  keeps the page's full width.

## DOGE since SNL (`src/doge/`)

Dogecoin's live USD price from CoinGecko against a fixed price for the minute
SNL went on air, 8 May 2021. Same layout as the hype meter: `ports.ts` defines
`PriceSource` and `DogeQuery`, and `createDogeModule()` in `index.ts` is the
only place that wires real adapters:

```
CoinGeckoPriceSource → CachedPriceSource (5 min TTL, one key, 1 min retry) → DogeService → DogeQuery
```

- `createDogeModule()` builds its own `HttpGet` from `axios.get` with a 10 s
  timeout, a 64 KB response cap, no redirects, and the same `User-Agent` as
  the hype meter. CoinGecko's `/simple/price` needs no key, so there is no
  env var. Tests pass in `get`, `clock` and `logger`.
- `sources/coingecko/parse.ts` reads `dogecoin.usd` and
  `dogecoin.last_updated_at`. It rejects the whole response unless `usd` is a
  finite number above zero and `last_updated_at` is a positive safe integer
  of Unix seconds that makes a valid date. It returns a `PriceQuote`
  (`{ at, usd }`). No CoinGecko field reaches `domain.ts` or the JSON.
- The SNL price is a constant, `SNL_SHOWTIME` in `snl.ts`, because CoinGecko's
  public history stops at 365 days. It is the open of Binance's DOGE/USDT
  1-minute candle at 03:30 UTC on 9 May 2021 (11:30 pm EDT on the 8th), and
  its `source.url` returns that candle. Every number on the page and in the
  API is measured against it.
- `CachedPriceSource` keeps a `CachedValue` under one fixed key, with a
  5-minute TTL and `retryAfterMs` of a minute. A failure after one good load
  serves the last good price. While CoinGecko is healthy that is at most 12
  calls an hour per process. During an outage it is one call a minute.
- `DogeService` fetches the price once per comparison and takes the ratio
  now ÷ SNL. `changePercent` is rounded to one decimal and
  `thousandDollarsNow` to cents, both from the unrounded ratio.
  `src/routes/doge.ts` serves `/api/doge` with `public, max-age=300`, or
  `200 { error }` with `no-store` through `upstreamFailure()`. `/doge` renders
  its unavailable state, also with `no-store`.
- Every `PriceSource` must satisfy the contract documented in `ports.ts`.
  `tests/doge/price-source.contract.ts` (`describePriceSource`) runs it on the
  CoinGecko source (through `fakeHttpGet` and the real capture in
  `tests/fixtures/coingecko-simple-price.json`), on `InMemoryPriceSource` and
  on `CachedPriceSource`.
- `format.ts` builds the `/doge` page model:
  - the change, with a U+2212 minus for display and words for screen
    readers ("Down 88.2%")
  - the SNL time in Eastern time ("11:30 pm ET") and the live time on a
    24-hour UTC clock
  - prices to four decimals
  - the default holding, the DOGE that $1,000 bought at showtime

### One formulas module for the server and the browser

The slider's maths (`amountAt`, `positionOf`, `parseAmount`, `holding`) lives
in `src/public/static/js/doge.js`. `format.ts` imports `holding` and
`positionOf` from that file on the server. The no-JS default and the numbers
the script shows then come from the same code, and a page test checks that
they match. Two copies would have needed a test to keep them in step.

The cost: the server imports `doge.js`, so the file must not touch the DOM or
any other browser global at module top level. Its only top-level browser call
is `start()`, behind `typeof document !== 'undefined'`. Module-level
`Intl.NumberFormat` instances are fine on both sides.

### Client and page

- `doge.js` is a vanilla ES module with JSDoc types.
  - `startHeldControl({ held, field, range, outputs })` holds the DOM wiring.
    `tests/doge/held-control.test.ts` tests it with `EventTarget` fakes, as
    `tests/hero.test.ts` does for `hero.js`.
  - `start()` only looks the elements up, and has no test of its own.
  - The script reads both prices from `data-` attributes and never fetches.
  - It writes with `replaceChildren`, never `innerHTML`.
  - The control is rendered `hidden` and the script reveals it.
- The pair figures size to their cell with `clamp(0.875rem, 12.5cqi, 1.5rem)`,
  so the slider's largest value (`$6,734,300.00` at 10M DOGE) fits on one line
  from 320 px.
  - For typed amounts too long to fit, the script adds `<wbr>` after each
    comma. It does this only in elements marked `data-wrap="commas"`, which
    are the two pair figures.
  - The sentence's figures get none, because Chrome honours `<wbr>` even
    inside `white-space: nowrap`.
  - The then/now lines are built from `.doge__unit` spans with
    `white-space: nowrap`, so they break only after " · " or ", ". At
    22.5rem (360 px) and below, only the dates show.
- `@media (scripting: enabled)` keeps the hidden control's box but makes it
  invisible, so revealing it shifts nothing below. Without scripting the
  control is `display: none`.
  - Trade-off: if scripting is on but `doge.js` never runs (a failed
    download, a blocked script), an empty gap of the control's height
    (about 141 px on a phone) stays above the then/now pair.
- `/doge`-only rules live in `doge.css` (`.doge*`). The home page loads
  neither `doge.css` nor `doge.js`, and `doge.js` is only emitted in the
  loaded state. `tests/doge/page.test.ts` enforces this and two budgets:
  20 KB of HTML and 4 KB for `doge.js`.
  - `doge.js` is 3,719 bytes, which leaves about 377 bytes. Trim the
    script rather than raise the budget; CONSTRAINTS.md does not allow
    raising a budget to make a change pass.

## Starlink globe (`src/starlink/`)

Every Starlink satellite in orbit, moving on a 3D globe, with this year's
re-entries listed as obituaries. Same layout as DOGE: `ports.ts` defines
`OrbitSource`, `ReentrySource` and `StarlinkQuery`, and
`createStarlinkModule()` in `index.ts` is the only place that wires axios, the
clock and the logger:

```
CelesTrakOrbitSource   → CachedOrbitSource   (6 h TTL, one key, 1 min or 2 h retry) ┐
CelesTrakReentrySource → CachedReentrySource (12 h TTL, one key, 1 min or 2 h retry) ┴→ StarlinkService → StarlinkQuery
```

- `createStarlinkModule()` gives axios a 10 s timeout, a 16 MB response cap,
  no redirects and the shared `User-Agent`. The GP group is 4.7 MB and the
  catalogue 4.3 MB. CelesTrak asks clients not to fetch a group more than
  once every 2 hours and blocks heavy users, so the TTLs are 6 and 12 hours.
  A repeat download inside CelesTrak's window can come back as a 403.
- `createStarlinkModule()` turns an axios error with a 403 or 429 response
  into `UpstreamRefusedError` (`ports.ts`), as the news module classifies
  its errors, so no axios type gets past `index.ts`. `retry-delay.ts` gives
  both cached sources their `retryAfterMs`: 2 hours after a refusal, which
  waits out CelesTrak's window, and a minute after any other failure
  (a 500, a timeout, a body with nothing usable). Stale data is served
  while they wait, and a cold cache fails fast with the same error. Each
  failure picks its own wait, so a timeout after a refusal waits a minute.
  CelesTrak's `Retry-After` header is not read; no captured 403 shows
  whether it sends one.
- `src/index.ts` warms both caches at start. `bun run dev` sets
  `SKIP_STARLINK_WARM_UP=1`, so a restart after a save makes no CelesTrak
  request; the first `/starlink` or `/api/starlink` request after a restart
  still downloads both catalogues, because the cache lives in the process.
  The 2-hour wait lives there too, so a restart or a crash forgets it, and
  each start inside a refusal makes one request per catalogue.
  If CelesTrak refuses the GP group at start, `/starlink` shows the
  re-entries without dots until the first request after the 2-hour wait.
- `sources/celestrak/parse-gp.ts` reads the Starlink GP group (OMM JSON).
  `EPOCH` has no zone suffix and is UTC; it is rounded to the millisecond.
  `MEAN_MOTION_DOT` is kept as CelesTrak gives it, half the rate of change of
  mean motion in rev/day², and becomes `meanMotionDot`.
  `parse-satcat.ts` reads the satellite catalogue. An empty `DECAY_DATE` means
  the satellite is still in orbit, so it is left out; a record without a valid
  `LAUNCH_DATE` is skipped. Both parsers skip a record with a missing field or
  a non-finite number, keep the first of a repeated id, and throw when nothing
  usable is left, so an empty list is never cached. No CelesTrak field name
  reaches `domain.ts` or the JSON.
- Each source stamps its result with `readAt` from the clock. The caches keep
  that stamp when they serve stale data, so `updatedAt` (the older of the two)
  says how old the data really is.
- `StarlinkService` asks both caches with `Promise.allSettled`. If one fails,
  its half of the snapshot is `null` and the route sends `no-store`. If both
  fail, it throws and `/api/starlink` answers `200 { error }`. The re-entry
  count is the decay dates in the clock's UTC year, so it rolls over at
  midnight UTC on 1 January from the cached catalogue. `recent` is that
  year's latest 12, newest first, ties by ascending id. The count includes the
  catalogue's two `STARLINK-34343 DEB` debris records.
- The cached sources return the same objects until they reload, so the service
  keeps its last snapshot and returns it while both loads and the UTC year are
  unchanged. The route keeps each snapshot's JSON string in a `WeakMap`. Per
  `/api/starlink` request that leaves the gzip (about 14 ms of the 16 ms
  median on the full catalogue) and Express's ETag hash.
- The service rounds elements to 5 decimals (`meanMotion`), 6
  (`meanMotionDot`), 4 (`eccentricity`) and 2 (angles). Unrounded, the
  2026-10-30 catalogue gzips to 469 KB; rounded, to 321 KB, under the 340 KB
  budget in `tests/starlink/budgets.test.ts`. Measured over all 11,130
  satellites at read time, the rounding moves a satellite by 0.55 km at the
  median, 1.52 km at p99 and 2.08 km at most, growing slowly with epoch age
  (2.36 km a day later). That is under a pixel on the globe. The budget test
  builds 11,130 satellites from the fixture with the capture's clustering
  (46% of epochs on 16 SpaceX epochs, one mean motion per shell, planes
  shared within a launch), which gzips to 327.6 KB, a little above the real
  321 KB.
- Every source must satisfy its contract in `ports.ts`.
  `tests/starlink/orbit-source.contract.ts` and `reentry-source.contract.ts`
  run on the CelesTrak sources (through `fakeHttpGet` and the trimmed real
  captures in `tests/fixtures/celestrak-starlink-*.json`), the in-memory
  sources and the cached sources.
- `bun test` runs in UTC, where local time and UTC agree, so a test that
  only checks UTC handling can't fail. The New Year, epoch and obituary-date
  tests run inside `inTimeZone()` (`tests/fakes.ts`) under Los Angeles or
  Kiritimati time. The helper saves the zone in effect and always assigns it
  back, so later tests stay in UTC (`tests/fakes.test.ts`). The obituary
  formatter is built when `format.ts` loads, so its test re-imports the
  module fresh (`?los-angeles`) inside the zone.
