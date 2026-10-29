import type { Article } from '../../src/news/domain';
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
