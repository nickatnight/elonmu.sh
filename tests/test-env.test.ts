import { describe, expect, it } from 'bun:test';
import { TEST_NEWS_API_KEY } from './setup/env';

describe('the test environment', () => {
  it('replaces NEWS_API_KEY with a fake key, whatever .env holds', () => {
    expect(process.env.NEWS_API_KEY).toBe(TEST_NEWS_API_KEY);
  });
});
