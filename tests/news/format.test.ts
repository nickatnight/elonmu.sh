import { describe, expect, it } from 'bun:test';
import { newsPage } from '../../src/news/format';
import { article } from './fakes';

describe('newsPage', () => {
  it('shows the source and the publish date as a medium US date in UTC', () => {
    expect(
      newsPage(article({ publishDate: '2026-10-22T23:30:00Z' }))
    ).toMatchObject({
      state: 'loaded',
      source: 'Business Insider',
      published: { datetime: '2026-10-22T23:30:00Z', text: 'Oct 22, 2026' }
    });
  });

  it('drops a publish date it cannot read', () => {
    expect(newsPage(article({ publishDate: 'yesterday-ish' }))).toMatchObject({
      published: null
    });
  });

  it.each([
    ['an https image', 'https://img.test/a.jpg', 'https://img.test/a.jpg'],
    ['an http image', 'http://img.test/a.jpg', null],
    ['a data: image', 'data:image/png;base64,AAAA', null],
    ['a javascript: url', 'javascript:alert(1)', null],
    ['no image', null, null],
    ['a malformed url', 'not a url', null]
  ])('keeps %s only if it is https', (_name, urlImage, image) => {
    expect(newsPage(article({ urlImage }))).toMatchObject({ image });
  });

  it.each([
    ['https', 'https://news.test/story', 'https://news.test/story'],
    ['http', 'http://news.test/story', null],
    ['javascript:', 'javascript:alert(1)', null]
  ])('links an %s article url only if it is https', (_name, url, link) => {
    expect(newsPage(article({ url }))).toMatchObject({ link });
  });

  it('keeps the title and a null description as they are', () => {
    expect(newsPage(article({ title: 'T', description: null }))).toMatchObject({
      title: 'T',
      description: null
    });
  });
});
