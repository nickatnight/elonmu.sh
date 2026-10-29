import type { Article, IsoTimestamp } from './domain';

const mediumUtcDate = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC'
});

const httpsOnly = (value: string | null): string | null => {
  if (value === null || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === 'https:' ? url.href : null;
};

const published = (at: IsoTimestamp) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? null
    : { datetime: at, text: mediumUtcDate.format(date) };
};

export type LoadedNewsPage = {
  state: 'loaded';
  source: string;
  published: { datetime: IsoTimestamp; text: string } | null;
  title: string;
  description: string | null;
  image: string | null;
  link: string | null;
};

export type NewsPage = LoadedNewsPage | { state: 'unavailable' };

export const newsPage = (article: Article): NewsPage => ({
  state: 'loaded',
  source: article.source,
  published: published(article.publishDate),
  title: article.title,
  description: article.description,
  image: httpsOnly(article.urlImage),
  link: httpsOnly(article.url)
});
