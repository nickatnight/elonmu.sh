import { describe, expect, it } from 'bun:test';
import { docsTarget } from '../src/public/static/js/legacy-anchors.js';

describe('docsTarget', () => {
  it.each([
    ['#get-api', '/docs#news-api'],
    ['#errors', '/docs#errors'],
    ['', null],
    ['#', null],
    ['#services', null],
    ['#try', null],
    ['#GET-API', null],
    ['#get-api-title', null],
    ['get-api', null]
  ])('sends %p to %p', (hash, target) => {
    expect(docsTarget(hash)).toBe(target);
  });
});
