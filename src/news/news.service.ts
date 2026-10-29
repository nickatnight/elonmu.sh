import type { Article } from './domain';
import type { ArticleSource, NewsQuery } from './ports';

export class NewsService implements NewsQuery {
  constructor(
    private readonly source: ArticleSource,
    private readonly draw: () => number
  ) {}

  async random(): Promise<Article> {
    const articles = await this.source.latest();
    const picked = articles[Math.floor(this.draw() * articles.length)];
    if (!picked) throw new Error('news: no article to pick');
    return picked;
  }
}
