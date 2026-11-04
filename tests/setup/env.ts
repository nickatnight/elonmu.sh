export const TEST_NEWS_API_KEY = 'test-news-api-key';

// Bun loads .env before the preloads run, so this replaces a developer's
// real key rather than filling in a missing one.
process.env.NEWS_API_KEY = TEST_NEWS_API_KEY;
