import { describe, expect, it } from 'bun:test';
import type { StarlinkSnapshot } from '../../src/starlink/domain';
import { lifespan, starlinkPage } from '../../src/starlink/format';
import { inTimeZone } from '../fakes';
import { sampleStarlink } from './fakes';

describe('lifespan', () => {
  it.each([
    ['2019-11-11', '2026-10-27', 'lived 6 years, 11 months'],
    ['2020-03-18', '2026-10-29', 'lived 6 years, 7 months'],
    ['2021-05-15', '2026-05-15', 'lived 5 years'],
    ['2021-05-15', '2026-05-14', 'lived 4 years, 11 months'],
    ['2025-10-01', '2026-11-01', 'lived 1 year, 1 month'],
    ['2025-12-15', '2026-10-25', 'lived 10 months'],
    ['2026-01-31', '2026-02-28', 'lived 28 days'],
    ['2026-03-14', '2026-04-10', 'lived 27 days'],
    ['2026-03-14', '2026-03-15', 'lived 1 day'],
    ['2026-03-14', '2026-03-14', 'lived less than a day']
  ])('from %s to %s reads "%s"', (launched, reentered, words) => {
    expect(lifespan(launched, reentered)).toBe(words);
  });
});

const snapshot = async (): Promise<StarlinkSnapshot> =>
  sampleStarlink().snapshot();

describe('starlinkPage', () => {
  it('prints the in-orbit count with thousands separators', async () => {
    const full = await snapshot();
    const page = starlinkPage({
      ...full,
      inOrbit: 11_130,
      satellites: full.satellites ?? []
    });
    expect(page.state === 'loaded' && page.inOrbit).toBe('11,130');
  });

  it('heads the obituaries with the approved line', async () => {
    const page = starlinkPage(await snapshot());
    expect(page.state === 'loaded' && page.obituaries?.heading).toBe(
      '83 burned up in 2026. RIP.'
    );
  });

  it('writes a big year with a separator too', async () => {
    const full = await snapshot();
    const reentries = full.reentries && { ...full.reentries, count: 1_459 };
    const page = starlinkPage({ ...full, reentries });
    expect(page.state === 'loaded' && page.obituaries?.heading).toBe(
      '1,459 burned up in 2026. RIP.'
    );
  });

  it('gives each obituary its launch year, re-entry day and lifespan', async () => {
    const page = starlinkPage(await snapshot());
    if (page.state !== 'loaded') throw new Error('not loaded');
    expect(page.obituaries?.list.slice(0, 3)).toEqual([
      {
        name: 'STARLINK-1309',
        launched: { datetime: '2020-03-18', text: '2020' },
        reentered: { datetime: '2026-10-29', text: 'Oct 29' },
        lifespan: 'lived 6 years, 7 months'
      },
      {
        name: 'STARLINK-30233',
        launched: { datetime: '2023-07-10', text: '2023' },
        reentered: { datetime: '2026-10-29', text: 'Oct 29' },
        lifespan: 'lived 3 years, 3 months'
      },
      {
        name: 'STARLINK-1036',
        launched: { datetime: '2019-11-11', text: '2019' },
        reentered: { datetime: '2026-10-27', text: 'Oct 27' },
        lifespan: 'lived 6 years, 11 months'
      }
    ]);
    expect(page.obituaries?.list).toHaveLength(12);
  });

  it('dates the re-entry day in UTC even when the server starts in Los Angeles', async () => {
    const loadedInLosAngeles = '../../src/starlink/format.ts?los-angeles';
    const page = await inTimeZone('America/Los_Angeles', async () => {
      const fresh = (await import(
        loadedInLosAngeles
      )) as typeof import('../../src/starlink/format');
      return fresh.starlinkPage(await snapshot());
    });
    expect(
      page.state === 'loaded' && page.obituaries?.list[0]?.reentered
    ).toEqual({ datetime: '2026-10-29', text: 'Oct 29' });
  });

  it('leaves out the counter when the orbits failed', async () => {
    const full = await snapshot();
    const page = starlinkPage({ ...full, inOrbit: null, satellites: null });
    expect(page.state === 'loaded' && page.inOrbit).toBeNull();
    expect(page.state === 'loaded' && page.obituaries?.list).toHaveLength(12);
  });

  it('leaves out the obituaries when the re-entries failed', async () => {
    const page = starlinkPage({ ...(await snapshot()), reentries: null });
    expect(page.state === 'loaded' && page.obituaries).toBeNull();
    expect(page.state === 'loaded' && page.inOrbit).toBe('200');
  });

  it('keeps only https: attribution links', async () => {
    const page = starlinkPage({
      ...(await snapshot()),
      attribution: [
        { name: 'CelesTrak', url: 'https://celestrak.org' },
        { name: 'Bad', url: 'javascript:alert(1)' }
      ]
    });
    expect(page.state === 'loaded' && page.attribution).toEqual([
      { name: 'CelesTrak', url: 'https://celestrak.org' }
    ]);
  });
});
