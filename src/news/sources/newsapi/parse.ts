import type { Article } from '../../domain';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const isOptionalString = (value: unknown): value is string | null | undefined =>
  value === null || value === undefined || isString(value);

const toArticle = (raw: unknown): Article | null => {
  if (!isObject(raw)) return null;
  const source = isObject(raw.source) ? raw.source.name : undefined;
  const { title, url, publishedAt, description, urlToImage } = raw;
  if (
    !isString(source) ||
    !isString(title) ||
    !isString(url) ||
    !isString(publishedAt) ||
    !isOptionalString(description) ||
    !isOptionalString(urlToImage)
  )
    return null;
  return {
    source,
    title,
    description: description ?? null,
    url,
    urlImage: urlToImage ?? null,
    publishDate: publishedAt
  };
};

export const parseArticles = (body: unknown): Article[] => {
  const raw = isObject(body) ? body.articles : undefined;
  if (!Array.isArray(raw)) throw new Error('newsapi: no articles in the body');
  const articles = raw
    .map(toArticle)
    .filter((article): article is Article => article !== null);
  if (articles.length === 0)
    throw new Error(`newsapi: none of ${raw.length} articles can be shown`);
  return articles;
};
