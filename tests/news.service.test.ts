import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn
} from 'bun:test';
import axios from 'axios';
import { fetchNewsArticle } from '../src/services/news.service';
import { newsApiArticle } from './fixtures';

const articles = [
  { ...newsApiArticle, title: 'first' },
  { ...newsApiArticle, title: 'second' },
  { ...newsApiArticle, title: 'third' }
];

// spyOn rather than mock.module('axios'): module mocks persist for the rest
// of the bun test run and would strip AxiosError from later test files.
let get: ReturnType<typeof spyOn<typeof axios, 'get'>>;
const originalApiKey = process.env.NEWS_API_KEY;

beforeEach(() => {
  get = spyOn(axios, 'get').mockResolvedValue({ data: { articles } });
});

afterEach(() => {
  mock.restore();
  process.env.NEWS_API_KEY = originalApiKey;
});

describe('fetchNewsArticle', () => {
  it('queries NewsAPI for English Elon Musk articles', async () => {
    process.env.NEWS_API_KEY = 'test-key';
    await fetchNewsArticle();

    const url = new URL(get.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://newsapi.org/v2/everything');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'elon musk',
      language: 'en',
      apiKey: 'test-key'
    });
  });

  it('picks from the articles actually returned', async () => {
    spyOn(Math, 'random').mockReturnValue(0.99);

    expect(await fetchNewsArticle()).toEqual(articles[2]);
  });

  it('can pick the first article', async () => {
    spyOn(Math, 'random').mockReturnValue(0);

    expect(await fetchNewsArticle()).toEqual(articles[0]);
  });
});
