import { describe, expect, it } from 'bun:test';
import {
  NewsApiArticleSource,
  newsUrl
} from '../../src/news/sources/newsapi/newsapi-article-source';
import { fakeHttpGet } from '../fakes';
import { newsApiArticle } from '../fixtures';
import { describeArticleSource } from './article-source.contract';
import { article, InMemoryArticleSource } from './fakes';

const KEY = 'test-key';

describeArticleSource('NewsApiArticleSource', {
  make: () =>
    new NewsApiArticleSource({
      http: fakeHttpGet({
        [newsUrl(KEY)]: { status: 'ok', articles: [newsApiArticle] }
      }).get,
      apiKey: KEY
    }),
  makeFailing: () =>
    new NewsApiArticleSource({ http: fakeHttpGet({}).get, apiKey: KEY })
});

describeArticleSource('InMemoryArticleSource', {
  make: () => new InMemoryArticleSource([article()]),
  makeFailing: () =>
    new InMemoryArticleSource([article()], { error: new Error('down') })
});

describe('NewsApiArticleSource', () => {
  it('asks NewsAPI for English Elon Musk articles with the key', async () => {
    const http = fakeHttpGet({
      [newsUrl(KEY)]: { articles: [newsApiArticle] }
    });
    await new NewsApiArticleSource({ http: http.get, apiKey: KEY }).latest();

    const url = new URL(http.calls[0] ?? '');
    expect(http.calls).toHaveLength(1);
    expect(url.origin + url.pathname).toBe('https://newsapi.org/v2/everything');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'elon musk',
      language: 'en',
      apiKey: KEY
    });
  });

  it('maps a NewsAPI article to the public article', async () => {
    const http = fakeHttpGet({
      [newsUrl(KEY)]: { articles: [newsApiArticle] }
    });
    expect(
      await new NewsApiArticleSource({ http: http.get, apiKey: KEY }).latest()
    ).toEqual([
      {
        source: 'Business Insider',
        title: newsApiArticle.title,
        description: newsApiArticle.description,
        url: newsApiArticle.url,
        urlImage: newsApiArticle.urlToImage,
        publishDate: newsApiArticle.publishedAt
      }
    ]);
  });

  it('passes the error through when NewsAPI fails', async () => {
    const failure = new Error('Request failed with status code 401');
    const http = async () => {
      throw failure;
    };
    await expect(
      new NewsApiArticleSource({ http, apiKey: KEY }).latest()
    ).rejects.toBe(failure);
  });
});
