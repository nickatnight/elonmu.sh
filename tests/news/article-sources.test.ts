import { describe, expect, it } from 'bun:test';
import {
  NewsApiArticleSource,
  newsUrl
} from '../../src/news/sources/newsapi/newsapi-article-source';
import { fakeHttpGet } from '../fakes';
import { newsApiArticle } from '../fixtures';
import { describeArticleSource } from './article-source.contract';
import { article, InMemoryArticleSource } from './fakes';

describeArticleSource('NewsApiArticleSource', {
  make: () =>
    new NewsApiArticleSource({
      http: fakeHttpGet({
        [newsUrl()]: { status: 'ok', articles: [newsApiArticle] }
      }).get
    }),
  makeFailing: () => new NewsApiArticleSource({ http: fakeHttpGet({}).get })
});

describeArticleSource('InMemoryArticleSource', {
  make: () => new InMemoryArticleSource([article()]),
  makeFailing: () =>
    new InMemoryArticleSource([article()], { error: new Error('down') })
});

describe('NewsApiArticleSource', () => {
  it('asks NewsAPI for English Elon Musk articles, with no key in the URL', async () => {
    const http = fakeHttpGet({
      [newsUrl()]: { articles: [newsApiArticle] }
    });

    await new NewsApiArticleSource({ http: http.get }).latest();

    const url = new URL(http.calls[0] ?? '');

    expect(http.calls).toHaveLength(1);
    expect(url.origin + url.pathname).toBe('https://newsapi.org/v2/everything');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'elon musk',
      language: 'en'
    });
  });

  it('maps a NewsAPI article to the public article', async () => {
    const http = fakeHttpGet({
      [newsUrl()]: { articles: [newsApiArticle] }
    });

    expect(await new NewsApiArticleSource({ http: http.get }).latest()).toEqual(
      [
        {
          source: 'Business Insider',
          title: newsApiArticle.title,
          description: newsApiArticle.description,
          url: newsApiArticle.url,
          urlImage: newsApiArticle.urlToImage,
          publishDate: newsApiArticle.publishedAt
        }
      ]
    );
  });

  it('passes the error through when NewsAPI fails', async () => {
    const failure = new Error('Request failed with status code 401');
    const http = async () => {
      throw failure;
    };

    await expect(new NewsApiArticleSource({ http }).latest()).rejects.toBe(
      failure
    );
  });
});
