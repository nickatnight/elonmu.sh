import { describe, expect, it } from 'bun:test';
import {
  CelesTrakReentrySource,
  SATCAT_URL
} from '../../src/starlink/sources/celestrak/celestrak-reentry-source';
import { InMemoryReentrySource } from '../../src/starlink/sources/memory/in-memory-reentry-source';
import { FakeClock, fakeHttpGet } from '../fakes';
import capture from '../fixtures/celestrak-starlink-satcat.json';
import { capturedReentries } from './fakes';
import { describeReentrySource } from './reentry-source.contract';

const READ_AT = '2026-10-30T04:14:02.000Z';

describeReentrySource('CelesTrakReentrySource', {
  make: () =>
    new CelesTrakReentrySource({
      http: fakeHttpGet({ [SATCAT_URL]: capture }).get,
      clock: new FakeClock(READ_AT)
    }),
  makeFailing: () =>
    new CelesTrakReentrySource({
      http: fakeHttpGet({}).get,
      clock: new FakeClock(READ_AT)
    })
});

describeReentrySource('InMemoryReentrySource', {
  make: () => new InMemoryReentrySource(capturedReentries()),
  makeFailing: () =>
    new InMemoryReentrySource(capturedReentries(), {
      error: new Error('upstream down')
    })
});

describe('CelesTrakReentrySource', () => {
  it('asks the CelesTrak satellite catalogue for every STARLINK record as JSON', async () => {
    const http = fakeHttpGet({ [SATCAT_URL]: capture });

    await new CelesTrakReentrySource({
      http: http.get,
      clock: new FakeClock(READ_AT)
    }).fetchReentries();
    expect(http.calls).toEqual([
      'https://celestrak.org/satcat/records.php?NAME=STARLINK&FORMAT=json'
    ]);
  });

  it('stamps the re-entries with the time the catalogue was read', async () => {
    const log = await new CelesTrakReentrySource({
      http: fakeHttpGet({ [SATCAT_URL]: capture }).get,
      clock: new FakeClock(READ_AT)
    }).fetchReentries();

    expect(log.readAt).toBe(READ_AT);
    expect(log.reentries).toHaveLength(121);
  });

  it('throws on a body with no usable re-entry', async () => {
    const source = new CelesTrakReentrySource({
      http: fakeHttpGet({ [SATCAT_URL]: [] }).get,
      clock: new FakeClock(READ_AT)
    });

    await expect(source.fetchReentries()).rejects.toThrow();
  });
});
