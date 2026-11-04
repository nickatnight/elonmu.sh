<p align="center">
    <a href="https://github.com/nickatnight/elonmu.sh/actions">
        <img alt="GitHub Actions status" src="https://github.com/nickatnight/elonmu.sh/actions/workflows/main.yml/badge.svg">
    </a>
    <a href="https://github.com/nickatnight/elonmu.sh/releases"><img alt="Release Status" src="https://img.shields.io/github/v/release/nickatnight/elonmu.sh"></a>
</p>

# elonmu.sh

Musk as a Service: a catalog of free, satirical tools about our Lord and Savior.
No key, no signup. /s

The tools: [News roulette](#news-roulette), the [Jet tracker](#jet-tracker),
the [Hype meter](#hype-meter), [DOGE since SNL](#doge-since-snl) and the
[Starlink globe](#starlink-globe). Every
endpoint is documented at [elonmu.sh/docs](https://elonmu.sh/docs), where each
one has a Send button that calls it live and shows the response.

## News roulette

One random news article about Elon Musk:
[elonmu.sh/news](https://elonmu.sh/news). The page is rendered on the server,
so it works without JavaScript, and "Another one" spins again. The articles
come from [NewsAPI](https://newsapi.org/).

The same data is available as JSON:

```shell
# Retrieve a random article
$ curl --request GET \
       --url 'https://elonmu.sh/api/news' \
       --header 'accept: application/json'
```

Example 200 response:

```json
{
  "source": "Business Insider",
  "title": "Wizards, horses, flip phones and AI: Elon Musk's 10 most colorful quotes from Tesla's investor day",
  "description": "Musk joked about charging mishaps, hailed the complexity of the human brain, and voiced his fears about the rise of artificial intelligence.",
  "url": "https://markets.businessinsider.com/news/stocks/elon-musk-tesla-investor-day-ai-electric-vehicles-self-driving-2023-3",
  "urlImage": "https://i.insider.com/64007dd7ce4a630019955630?width=1200&format=jpeg",
  "publishDate": "2023-03-02T11:37:41Z"
}
```

Example 200 response when NewsAPI fails or is unreachable (the service itself is healthy, so it still returns 200):

```json
{
  "error": "There was an error with NewsAPI. Please try again later."
}
```

Any other failure returns a 500 with the same `{ "error": "..." }` shape.
- `description` and `urlImage` can be `null`. An article from NewsAPI without
  a source name, title, URL or publish date is skipped, never served.
- The latest page of NewsAPI results is cached for 15 minutes, and each request
  picks one article from it, so an article published in the last 15 minutes may
  not show up yet. If NewsAPI fails after one good load, the last good articles
  are used. After a failure, the server waits a minute before asking NewsAPI
  again. NewsAPI gets 10 seconds to answer. If it never answers, the body is
  `{ "error": "There was an error with request. Please try again later." }`,
  still with a 200.
- `/news` sends `Cache-Control: no-store`, because each load picks a new
  article. When NewsAPI is down it still answers 200, with a short note.

## Jet tracker

Every private-jet flight this year, on a globe, with the fuel bill:
[elonmu.sh/jet](https://elonmu.sh/jet). The flights come from the public posts
of [@elonjet.net](https://bsky.app/profile/elonjet.net) by Jack Sweeney on
Bluesky.

The same data is available as JSON:

```shell
$ curl --request GET \
       --url 'https://elonmu.sh/api/jet/flights' \
       --header 'accept: application/json'
```

The response has `year`, `updatedAt`, `attribution`, `flights` (newest first)
and `totals`. It is cached for 60 seconds. If the flight data is unavailable,
it returns a 200 with `{ "error": "..." }`, like the News API.

## Hype meter

Daily views of the English Wikipedia article "Elon Musk" for the last year,
drawn as a seismograph with the biggest spikes named:
[elonmu.sh/hype](https://elonmu.sh/hype). The views come from
[Wikimedia's pageview API](https://wikimedia.org/api/rest_v1/) (users only,
known bots excluded).

The same data is available as JSON:

```shell
$ curl --request GET \
       --url 'https://elonmu.sh/api/hype' \
       --header 'accept: application/json'
```

Example 200 response (`days` shortened):

```json
{
  "article": "Elon Musk",
  "from": "2025-10-27",
  "to": "2026-10-26",
  "updatedAt": "2026-10-27T09:12:44.000Z",
  "attribution": {
    "label": "Wikimedia pageviews (en.wikipedia, users only)",
    "url": "https://pageviews.wmcloud.org/?project=en.wikipedia.org&pages=Elon_Musk"
  },
  "days": [{ "date": "2025-10-27", "views": 19194 }],
  "stats": {
    "total": 8678483,
    "median": 20803,
    "peak": { "date": "2026-06-12", "views": 194434 }
  },
  "spikes": [{ "date": "2026-06-12", "views": 194434, "timesMedian": 9.3 }]
}
```

- `days` is **oldest first**, in chart order. The jet tracker's `flights` is
  newest first.
- The window ends yesterday (UTC). `from` and `to` are the first and last days
  Wikimedia actually returned, so `to` can be the day before yesterday early in
  the UTC day. Days Wikimedia has no data for are left out, not zero-filled.
- `stats.median` is the middle day's views, a whole number. With an even
  number of days it is the mean of the two middle days, rounded.
- `spikes` is the five busiest days, highest first, each at least 7 days from
  any busier one. `timesMedian` is that day's views over the median, to one
  decimal.
- It is cached for an hour. If Wikimedia is unavailable and nothing has loaded
  yet, it returns a 200 with `{ "error": "..." }`, like the News API. After one
  good load, a failure serves the last good series instead. After a failure,
  the server waits a minute before asking Wikimedia again.

## DOGE since SNL

Dogecoin's price now against the minute he went on air hosting Saturday Night
Live, 8 May 2021: [elonmu.sh/doge](https://elonmu.sh/doge). The live price
comes from [CoinGecko](https://www.coingecko.com/en/coins/dogecoin) (no key
needed). The page also has a slider for how much DOGE you held at showtime,
from 10 to 10 million. It runs in your browser, and the API has no amount
parameter.

The same data is available as JSON:

```shell
$ curl --request GET \
       --url 'https://elonmu.sh/api/doge' \
       --header 'accept: application/json'
```

Example 200 response:

```json
{
  "coin": "Dogecoin",
  "snl": {
    "at": "2021-05-09T03:30:00.000Z",
    "usd": 0.67343,
    "source": {
      "label": "Binance DOGE/USDT, 1-minute open at showtime",
      "url": "https://data-api.binance.vision/api/v3/klines?symbol=DOGEUSDT&interval=1m&startTime=1620531000000&limit=1"
    }
  },
  "now": { "at": "2026-10-28T04:30:56.000Z", "usd": 0.079484 },
  "changePercent": -88.2,
  "thousandDollarsNow": 118.03,
  "attribution": {
    "label": "Data provided by CoinGecko",
    "url": "https://www.coingecko.com/en/coins/dogecoin"
  }
}
```

- `changePercent` is (now ÷ SNL − 1) × 100, rounded to one decimal.
  `thousandDollarsNow` is what $1,000 of DOGE bought at showtime is worth now,
  rounded to the cent. Both are computed from the unrounded prices.
- `snl` never changes. CoinGecko's free history only goes back 365 days, so
  the SNL price is a constant: the open of Binance's DOGE/USDT 1-minute candle
  at 11:30 pm EDT on 8 May 2021, when the show went on air. `snl.source.url`
  returns that candle. USDT is taken as USD.
- `now.at` is when CoinGecko last updated its price, not when you asked.
- It is cached for 5 minutes (`Cache-Control: public, max-age=300`). If
  CoinGecko is unavailable and nothing has loaded yet, it returns a 200 with
  `{ "error": "..." }`, like the News API, and `Cache-Control: no-store`.
  After one good load, a failure serves the last good price instead. After a
  failure, the server waits a minute before asking CoinGecko again.

## Starlink globe

Every Starlink satellite in orbit, moving live on a globe, with this year's
re-entries listed as obituaries: [elonmu.sh/starlink](https://elonmu.sh/starlink).
The orbits and the re-entries come from [CelesTrak](https://celestrak.org) (the
Starlink GP group and the satellite catalogue).

The same data is available as JSON:

```shell
$ curl --request GET \
       --url 'https://elonmu.sh/api/starlink' \
       --header 'accept: application/json'
```

Example 200 response (`satellites` and `recent` shortened):

```json
{
  "updatedAt": "2026-10-30T04:52:13.127Z",
  "inOrbit": 11130,
  "satellites": [
    {
      "id": 44714,
      "name": "STARLINK-1008",
      "epoch": "2026-10-28T20:33:11.108Z",
      "meanMotion": 15.68273,
      "meanMotionDot": 0.00034,
      "eccentricity": 0.0002,
      "inclination": 53.14,
      "raan": 138.75,
      "argOfPerigee": 162.32,
      "meanAnomaly": 197.79
    }
  ],
  "reentries": {
    "year": 2026,
    "count": 459,
    "recent": [
      {
        "id": 45414,
        "name": "STARLINK-1309",
        "launched": "2020-03-18",
        "reentered": "2026-10-29"
      }
    ]
  },
  "attribution": [{ "name": "CelesTrak", "url": "https://celestrak.org" }]
}
```

- The full response is about 2.4 MB, 330 KB gzipped. Elements are rounded:
  `meanMotion` (rev/day) to 5 decimals, `meanMotionDot` (half the rate of
  change of mean motion, rev/day², as in a TLE) to 6, `eccentricity` to 4,
  and the angles in degrees to 2. Across the catalogue that moves a satellite
  by up to about 2 km.
- `reentries.count` is this UTC year's re-entries, so it starts again from 0 on
  1 January. `recent` is the latest 12, newest first.
- Orbits are refreshed every 6 hours and re-entries every 12, because CelesTrak
  asks clients not to download a group more often than every 2 hours. The
  response is cached for an hour. If one half has never loaded, it is `null`
  and the response is sent with `Cache-Control: no-store`. If neither has, it
  returns a 200 with `{ "error": "..." }`, like the News API. After a failure,
  the server waits a minute before asking CelesTrak again, or 2 hours if
  CelesTrak refused with a 403 or 429.

## Development

Requires [Bun](https://bun.sh) 1.4.4+ and a free [NewsAPI](https://newsapi.org/) key.

```shell
$ bun install
$ cp .env.example .env    # then set NEWS_API_KEY
$ bun run dev             # http://localhost:8080, restarts on changes
$ bun test
$ bun test tests/jet/parse.test.ts   # one file
$ bun test -t 'pairs a takeoff'      # tests whose name matches
$ bun run format          # apply Biome formatting, then ESLint's blank lines
$ bun run check           # format check, lint, typecheck, tests (what CI runs)
```

`bun run dev` restarts on every save. It sets `SKIP_STARLINK_WARM_UP=1`, so a
restart does not download the Starlink catalogues (about 9 MB from CelesTrak);
`bun start` does. The cache lives in the process, though, so the first visit
to `/starlink` after each restart still downloads them. CelesTrak answers
repeat downloads inside its 2-hour window with a 403 and blocks heavy users,
so avoid reloading `/starlink` in a loop while editing. Running
`bun --watch src/index.ts` yourself does warm the cache, unless you set
`SKIP_STARLINK_WARM_UP=1` too.

Two scripts are run by hand, offline:

```shell
$ bun scripts/geocode-places.ts      # when the server logs "jet: unknown place"
$ bun scripts/render-teaser-earth.ts # after changing TEASER_VIEW or TEASER_SIZE (needs ffmpeg)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the code fits together.

The landing page at `/` is plain server-rendered HTML with no build step:
`src/views/index.ejs`, one stylesheet (`src/public/static/css/main.css`) and
three small vanilla scripts. `src/public/static/js/main.js` runs the scroll
reveal, `src/public/static/js/hero.js` (an ES module) plays the launch clip,
crossfades into the cruise loop and runs the pause toggle, and
`src/public/static/js/legacy-anchors.js` sends old `/#get-api` and `/#errors`
links on to `/docs`. The API docs at `/docs` load
`src/public/static/js/console.js` for their Send and Copy buttons. Static
files are cached for a year, so templates
reference them through `asset('static/...')`, which appends a hash of the file's
contents to the URL.

## Deploy

Production runs on [Render](https://render.com) as a Docker web service, built
from the `Dockerfile` in this repo. Merging to `main` deploys automatically once
CI passes, and Render health-checks `/healthz` (which never calls NewsAPI).

To run the production image locally:

```shell
$ docker build -t elonmush .
$ docker run --rm -p 8080:8080 -e PORT=8080 --env-file .env elonmush
$ curl localhost:8080/healthz
```

## Why?

For fun 🤡...and to ramp up on TypeScript/Node/ExpressJS. This API is basically a thin wrapper around [NewsAPI](https://newsapi.org/), and runs on Render.

Enjoy
