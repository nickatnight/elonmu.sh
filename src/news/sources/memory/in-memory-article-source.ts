import type { Article } from '../../domain';
import type { ArticleSource } from '../../ports';

export class InMemoryArticleSource implements ArticleSource {
  private readonly error: Error | null;

  constructor(
    private readonly articles: readonly Article[],
    options: { error?: Error } = {}
  ) {
    this.error = options.error ?? null;
  }

  async latest(): Promise<Article[]> {
    if (this.error) throw this.error;
    return this.articles.map((article) => ({ ...article }));
  }
}
