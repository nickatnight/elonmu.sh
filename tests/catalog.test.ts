import { describe, expect, it } from 'bun:test';
import { SERVICES } from '../src/catalog';

describe('SERVICES', () => {
  it('lists the News API, then the jet tracker', () => {
    expect(SERVICES.map((service) => service.id)).toEqual([
      'news-api',
      'jet-tracker'
    ]);
  });

  it('has unique, kebab-case ids', () => {
    const ids = SERVICES.map((service) => service.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('links every service to a same-origin path', () => {
    // A leading "//" would be protocol-relative, i.e. another origin.
    for (const { href } of SERVICES) expect(href).toMatch(/^\/(?!\/)/);
  });

  it('fills every field', () => {
    for (const service of SERVICES) {
      for (const [field, value] of Object.entries(service)) {
        expect({ field, value: value.trim() }).not.toEqual({
          field,
          value: ''
        });
      }
    }
  });

  it('keeps HTML out of the summaries', () => {
    for (const { summary } of SERVICES) expect(summary).not.toMatch(/[<>]/);
  });
});
