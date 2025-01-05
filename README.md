<p align="center">
    <a href="https://github.com/nickatnight/elonmu.sh/actions">
        <img alt="GitHub Actions status" src="https://github.com/nickatnight/elonmu.sh/actions/workflows/main.yml/badge.svg">
    </a>
    <a href="https://github.com/nickatnight/elonmu.sh/releases"><img alt="Release Status" src="https://img.shields.io/github/v/release/nickatnight/elonmu.sh"></a>
</p>

# elonmu.sh

MaaS is a free public API for fetching random news articles which mention our Lord and Savior...Elon Musk /s

## Usage

```shell
# Retrieve a random article
$ curl --request GET \
       --url 'https://elonmu.sh/api' \
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

Example 400 response:

```json
{
  "error": "There was an error with NewsAPI. Please try again later."
}
```

## Why?

For fun 🤡...and to ramp up on TypeScript/Node/ExpressJS. This API is basically a thin wrapper around [NewsAPI](https://newsapi.org/), and deployed using DigitalOceans App Platform.

Enjoy
