import type { Article } from '../../src/news/domain';
import { NewsService } from '../../src/news/news.service';
import type { NewsQuery } from '../../src/news/ports';
import { InMemoryArticleSource } from '../../src/news/sources/memory/in-memory-article-source';

export { InMemoryArticleSource };

export const article = (overrides: Partial<Article> = {}): Article => ({
  source: 'Business Insider',
  title: "Elon Musk's 10 most colorful quotes from Tesla's investor day",
  description: 'Musk joked about charging mishaps.',
  url: 'https://example.com/elon-musk-investor-day',
  urlImage: 'https://example.com/elon.jpg',
  publishDate: '2023-03-02T11:37:41Z',
  ...overrides
});

export const sampleNews = (articles: Article[] = [article()]): NewsQuery =>
  new NewsService(new InMemoryArticleSource(articles), () => 0);

export const failingNews = (): NewsQuery => ({
  random: () => Promise.reject(new Error('newsapi down'))
});
