import { describe, expect, it } from 'bun:test';
import { NewsService } from '../../src/news/news.service';
import { article, InMemoryArticleSource } from './fakes';

const articles = [
  article({ title: 'first' }),
  article({ title: 'second' }),
  article({ title: 'third' })
];

const pickWith = (random: number) =>
  new NewsService(new InMemoryArticleSource(articles), () => random).random();

describe('NewsService', () => {
  it('picks from the articles actually returned', async () => {
    expect(await pickWith(0.99)).toEqual(articles[2]);
  });

  it('can pick the first article', async () => {
    expect(await pickWith(0)).toEqual(articles[0]);
  });

  it('picks by position, so a middle draw lands in the middle', async () => {
    expect((await pickWith(0.5)).title).toBe('second');
  });

  it('fails when the article source fails', async () => {
    const news = new NewsService(
      new InMemoryArticleSource(articles, { error: new Error('down') }),
      () => 0
    );
    await expect(news.random()).rejects.toThrow('down');
  });
});
