import { describe, expect, it } from 'bun:test';

describe('the test environment', () => {
  it('replaces NEWS_API_KEY with a fake key, whatever .env holds', () => {
    expect(process.env.NEWS_API_KEY).toBe('test-news-api-key');
  });
});
