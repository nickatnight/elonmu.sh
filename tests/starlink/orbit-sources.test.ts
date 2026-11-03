import { describe, expect, it } from 'bun:test';
import {
  CelesTrakOrbitSource,
  GP_URL
} from '../../src/starlink/sources/celestrak/celestrak-orbit-source';
import { InMemoryOrbitSource } from '../../src/starlink/sources/memory/in-memory-orbit-source';
import { FakeClock, fakeHttpGet } from '../fakes';
import capture from '../fixtures/celestrak-starlink-gp.json';
import { capturedOrbits } from './fakes';
import { describeOrbitSource } from './orbit-source.contract';

const READ_AT = '2026-10-30T04:13:47.000Z';

describeOrbitSource('CelesTrakOrbitSource', {
  make: () =>
    new CelesTrakOrbitSource({
      http: fakeHttpGet({ [GP_URL]: capture }).get,
      clock: new FakeClock(READ_AT)
    }),
  makeFailing: () =>
    new CelesTrakOrbitSource({
      http: fakeHttpGet({}).get,
      clock: new FakeClock(READ_AT)
    })
});

describeOrbitSource('InMemoryOrbitSource', {
  make: () => new InMemoryOrbitSource(capturedOrbits()),
  makeFailing: () =>
    new InMemoryOrbitSource(capturedOrbits(), {
      error: new Error('upstream down')
    })
});

describe('CelesTrakOrbitSource', () => {
  it("asks CelesTrak for the Starlink GP group as JSON, CelesTrak's own query", async () => {
    const http = fakeHttpGet({ [GP_URL]: capture });
    await new CelesTrakOrbitSource({
      http: http.get,
      clock: new FakeClock(READ_AT)
    }).fetchOrbits();
    expect(http.calls).toEqual([
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json'
    ]);
  });

  it('stamps the catalogue with the time it was read', async () => {
    const catalog = await new CelesTrakOrbitSource({
      http: fakeHttpGet({ [GP_URL]: capture }).get,
      clock: new FakeClock(READ_AT)
    }).fetchOrbits();
    expect(catalog.readAt).toBe(READ_AT);
    expect(catalog.satellites).toHaveLength(200);
  });

  it('throws on a body with no usable satellite', async () => {
    const source = new CelesTrakOrbitSource({
      http: fakeHttpGet({ [GP_URL]: 'No GP data found' }).get,
      clock: new FakeClock(READ_AT)
    });
    await expect(source.fetchOrbits()).rejects.toThrow();
  });
});
