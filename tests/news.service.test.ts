import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { newsApiArticle } from './fixtures';

const articles = [
  { ...newsApiArticle, title: 'first' },
  { ...newsApiArticle, title: 'second' },
  { ...newsApiArticle, title: 'third' }
];
const get = mock(async (_url: string) => ({ data: { articles } }));

mock.module('axios', () => ({ default: { get } }));

const { fetchNewsArticle } = await import('../src/services/news.service');

afterEach(() => {
  mock.restore();
  get.mockClear();
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
