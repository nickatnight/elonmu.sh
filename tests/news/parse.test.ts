import { describe, expect, it } from 'bun:test';
import { parseArticles } from '../../src/news/sources/newsapi/parse';
import { newsApiArticle } from '../fixtures';

const body = (...articles: unknown[]) => ({
  status: 'ok',
  totalResults: articles.length,
  articles
});

describe('parseArticles', () => {
  it.each([
    ['a body with no articles array', { status: 'ok' }],
    ['a body whose articles is not an array', { articles: 'nope' }],
    ['a null body', null],
    ['a string body', '<html>rate limited</html>'],
    ['an empty articles array', body()],
    [
      'articles none of which can be shown',
      body({ ...newsApiArticle, title: null }, { url: 'https://x.test' })
    ]
  ])('throws on %s', (_name, input) => {
    expect(() => parseArticles(input)).toThrow();
  });

  it.each([
    [
      'keeps a null description and image as null',
      { description: null, urlToImage: null },
      { description: null, urlImage: null }
    ],
    [
      'reads a missing description and image as null',
      { description: undefined, urlToImage: undefined },
      { description: null, urlImage: null }
    ],
    [
      'takes the source from source.name, not source.id',
      { source: { id: null, name: 'Reuters' } },
      { source: 'Reuters' }
    ]
  ])('%s', (_name, change, expected) => {
    const [parsed] = parseArticles(body({ ...newsApiArticle, ...change }));
    expect(parsed).toMatchObject(expected);
  });

  it.each([
    ['a null title', { title: null }],
    ['a missing url', { url: undefined }],
    ['a source without a name', { source: { id: 'x' } }],
    ['a numeric publish date', { publishedAt: 1677757061 }],
    ['a numeric description', { description: 42 }],
    ['a non-object entry', 'just a string']
  ])('skips an article with %s and keeps the rest', (_name, change) => {
    const broken =
      typeof change === 'string' ? change : { ...newsApiArticle, ...change };
    const parsed = parseArticles(
      body(broken, { ...newsApiArticle, title: 'kept' })
    );
    expect(parsed.map((a) => a.title)).toEqual(['kept']);
  });

  it('drops NewsAPI-only fields such as author and content', () => {
    const [parsed] = parseArticles(body(newsApiArticle));
    expect(parsed).not.toHaveProperty('author');
    expect(parsed).not.toHaveProperty('content');
    expect(parsed).not.toHaveProperty('urlToImage');
  });
});
