import type { Article } from './domain';

export interface ArticleSource {
  /**
   * Contract (tests/news/article-source.contract.ts):
   * 1. returns at least one article
   * 2. source, title, url and publishDate are strings
   * 3. description and urlImage are a string or null
   * 4. carries only the six Article fields, no upstream ones
   * 5. throws on upstream failure or a malformed response
   */
  latest(): Promise<Article[]>;
}

export interface NewsQuery {
  random(): Promise<Article>;
}
