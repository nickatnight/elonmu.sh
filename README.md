<p align="center">
    <a href="https://github.com/nickatnight/elonmu.sh/actions">
        <img alt="GitHub Actions status" src="https://github.com/nickatnight/elonmu.sh/actions/workflows/main.yml/badge.svg">
    </a>
    <a href="https://github.com/nickatnight/elonmu.sh/releases"><img alt="Release Status" src="https://img.shields.io/github/v/release/nickatnight/elonmu.sh"></a>
</p>

# elonmu.sh

Musk as a Service: a catalog of free, satirical tools about our Lord and Savior.
No key, no signup. /s

## News API

One random news article about Elon Musk, as JSON.

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

## Development

Requires [Bun](https://bun.sh) 1.4.4+ and a free [NewsAPI](https://newsapi.org/) key.

```shell
$ bun install
$ cp .env.example .env    # then set NEWS_API_KEY
$ bun run dev             # http://localhost:8080, restarts on changes
$ bun test
$ bun run check           # format check, lint, typecheck, tests (what CI runs)
```

The landing page at `/` is plain server-rendered HTML with no build step:
`src/views/index.ejs`, one stylesheet (`src/public/static/css/main.css`) and one
small vanilla script (`src/public/static/js/main.js`) that powers the live
console and copy buttons. Static files are cached for a year, so templates
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
