import { describe, expect, it } from 'bun:test';
import type { ArticleSource } from '../../src/news/ports';

export type ContractSubject = {
  make: () => ArticleSource;
  makeFailing: () => ArticleSource;
};

const nullableString = (value: unknown): boolean =>
  value === null || typeof value === 'string';

export const describeArticleSource = (
  name: string,
  subject: ContractSubject
): void => {
  describe(`${name} meets the ArticleSource contract`, () => {
    it('1. returns at least one article', async () => {
      expect((await subject.make().latest()).length).toBeGreaterThan(0);
    });

    it('2. gives every article a source, title, url and publish date as strings', async () => {
      for (const article of await subject.make().latest()) {
        for (const field of ['source', 'title', 'url', 'publishDate'] as const)
          expect({ field, type: typeof article[field] }).toEqual({
            field,
            type: 'string'
          });
      }
    });

    it('3. gives every article a description and image that are a string or null', async () => {
      for (const article of await subject.make().latest()) {
        expect(nullableString(article.description)).toBe(true);
        expect(nullableString(article.urlImage)).toBe(true);
      }
    });

    it('4. carries only the six public fields, no upstream ones', async () => {
      for (const article of await subject.make().latest())
        expect(Object.keys(article).sort()).toEqual([
          'description',
          'publishDate',
          'source',
          'title',
          'url',
          'urlImage'
        ]);
    });

    it('5. throws when the upstream fails', async () => {
      await expect(subject.makeFailing().latest()).rejects.toThrow();
    });
  });
};
