import * as querystring from 'node:querystring';
import type { HttpGet } from '../../../ports';
import type { Article } from '../../domain';
import type { ArticleSource } from '../../ports';
import { parseArticles } from './parse';

const NEWS_API_URL = 'https://newsapi.org/v2/everything';

export const newsUrl = (apiKey: string): string =>
  `${NEWS_API_URL}?${querystring.stringify({
    q: 'elon musk',
    language: 'en',
    apiKey
  })}`;

export class NewsApiArticleSource implements ArticleSource {
  constructor(private readonly deps: { http: HttpGet; apiKey: string }) {}

  latest = async (): Promise<Article[]> =>
    parseArticles(await this.deps.http<unknown>(newsUrl(this.deps.apiKey)));
}
