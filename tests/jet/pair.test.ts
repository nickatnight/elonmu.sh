import { describe, expect, it } from 'bun:test';
import { type Fuel, type Place, UNKNOWN_TAIL } from '../../src/jet/domain';
import type { PlaceResolver } from '../../src/jet/ports';
import {
  type PairOptions,
  pairFlights
} from '../../src/jet/sources/bluesky/pair';
import type { JetEvent } from '../../src/jet/sources/bluesky/parse';
import { FakeLogger, places } from './fakes';
import { assertFlightShape } from './flight-source.contract';

const AUSTIN = places.austin.name;
const SAN_JOSE = places.sanJose.name;
const HAWTHORNE = places.hawthorne.name;

const resolver: PlaceResolver = {
  resolve: (name) =>
    Object.values(places).find((p: Place) => p.name === name) ?? null
};

const ev = (
  kind: JetEvent['kind'],
  at: string,
  place: string,
  extra: Partial<JetEvent> = {}
): JetEvent => ({
  kind,
  tail: 'N8628',
  place,
  at,
  durationMin: null,
  uri: `at://did:plc:elonjet/app.bsky.feed.post/${kind}-${at}`,
  ...extra
});

const fuel: Fuel = { gallons: 782, usd: 6083, co2Tons: 8 };

const run = (events: JetEvent[], overrides: Partial<PairOptions> = {}) => {
  const logger = new FakeLogger();
  const flights = pairFlights(events, {
    fuelByParentUri: new Map(),
    resolver,
    now: new Date('2026-10-01T00:00:00.000Z'),
    logger,
    postUrl: (uri) => `https://bsky.app/post/${uri.split('/').at(-1)}`,
    ...overrides
  });
  return { flights, logger };
};

describe('pairFlights', () => {
  it('pairs a takeoff with the same tail’s next landing', () => {
    const takeoff = ev('takeoff', '2026-09-01T14:00:00.000Z', AUSTIN);
    const landing = ev('landing', '2026-09-01T17:05:00.000Z', SAN_JOSE, {
      durationMin: 185
    });
    const { flights } = run([landing, takeoff], {
      fuelByParentUri: new Map([[landing.uri, fuel]])
    });
    expect(flights).toEqual([
      {
        id: `takeoff-2026-09-01T14:00:00.000Z`,
        tail: 'N8628',
        from: places.austin,
        to: places.sanJose,
        departedAt: '2026-09-01T14:00:00.000Z',
        landedAt: '2026-09-01T17:05:00.000Z',
        durationMin: 185,
        fuel,
        status: 'landed',
        sourceUrl: 'https://bsky.app/post/takeoff-2026-09-01T14:00:00.000Z'
      }
    ]);
  });

  it('derives the duration from the two posts when the landing gives none', () => {
    const { flights } = run([
      ev('takeoff', '2026-09-01T14:00:00.000Z', AUSTIN),
      ev('landing', '2026-09-01T16:30:00.000Z', SAN_JOSE)
    ]);
    expect(flights[0].durationMin).toBe(150);
  });

  it('keeps a landing with no takeoff as an arrival-only flight', () => {
    const landing = ev('landing', '2026-09-02T09:00:00.000Z', HAWTHORNE, {
      durationMin: 60
    });
    const { flights } = run([landing]);
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      id: `landing-2026-09-02T09:00:00.000Z`,
      from: null,
      to: places.hawthorne,
      departedAt: null,
      landedAt: '2026-09-02T09:00:00.000Z',
      durationMin: 60,
      status: 'landed'
    });
  });

  it('marks the tail’s latest takeoff airborne while it is under 18 h old', () => {
    const { flights } = run(
      [ev('takeoff', '2026-09-30T12:00:00.000Z', AUSTIN)],
      { now: new Date('2026-09-30T20:00:00.000Z') }
    );
    expect(flights).toEqual([
      expect.objectContaining({
        from: places.austin,
        to: null,
        departedAt: '2026-09-30T12:00:00.000Z',
        landedAt: null,
        durationMin: null,
        fuel: null,
        status: 'airborne'
      })
    ]);
  });

  it('drops a latest takeoff once it is 18 h old with no landing', () => {
    const { flights } = run(
      [ev('takeoff', '2026-09-30T02:00:00.000Z', AUSTIN)],
      { now: new Date('2026-09-30T20:00:00.000Z') }
    );
    expect(flights).toEqual([]);
  });

  it('drops a takeoff that is followed by another takeoff', () => {
    const { flights } = run([
      ev('takeoff', '2026-09-01T14:00:00.000Z', AUSTIN),
      ev('takeoff', '2026-09-03T14:00:00.000Z', SAN_JOSE),
      ev('landing', '2026-09-03T17:00:00.000Z', AUSTIN)
    ]);
    expect(flights.map((f) => f.from?.name)).toEqual([SAN_JOSE]);
  });

  it('splits a takeoff from a landing more than 24 h later', () => {
    const { flights } = run([
      ev('takeoff', '2026-09-01T14:00:00.000Z', AUSTIN),
      ev('landing', '2026-09-02T15:00:00.000Z', SAN_JOSE)
    ]);
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({ from: null, to: places.sanJose });
  });

  it('splits a takeoff from a landing whose posted flight time disagrees by over an hour', () => {
    const { flights } = run([
      ev('takeoff', '2026-09-01T10:00:00.000Z', AUSTIN),
      ev('landing', '2026-09-01T16:00:00.000Z', HAWTHORNE, { durationMin: 45 })
    ]);
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      from: null,
      to: places.hawthorne,
      durationMin: 45
    });
  });

  it('keeps a local hop with the same place at both ends', () => {
    const { flights } = run([
      ev('takeoff', '2026-09-01T14:00:00.000Z', AUSTIN),
      ev('landing', '2026-09-01T14:20:00.000Z', AUSTIN, { durationMin: 17 })
    ]);
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      from: places.austin,
      to: places.austin
    });
  });

  it('pairs interleaved tails separately', () => {
    const { flights } = run([
      ev('takeoff', '2026-09-01T14:00:00.000Z', AUSTIN, { tail: 'N8628' }),
      ev('takeoff', '2026-09-01T14:10:00.000Z', SAN_JOSE, { tail: 'N7628' }),
      ev('landing', '2026-09-01T16:00:00.000Z', HAWTHORNE, { tail: 'N8628' }),
      ev('landing', '2026-09-01T17:00:00.000Z', AUSTIN, { tail: 'N7628' })
    ]);
    const route = (tail: string) => {
      const f = flights.find((x) => x.tail === tail);
      return `${f?.from?.name} → ${f?.to?.name}`;
    };
    expect(flights).toHaveLength(2);
    expect(route('N8628')).toBe(`${AUSTIN} → ${HAWTHORNE}`);
    expect(route('N7628')).toBe(`${SAN_JOSE} → ${AUSTIN}`);
  });

  it('files tail-less events under the Unknown tail and pairs them together', () => {
    const { flights } = run([
      ev('takeoff', '2026-01-22T05:00:00.000Z', AUSTIN, { tail: null }),
      ev('landing', '2026-01-22T13:22:00.000Z', SAN_JOSE, {
        tail: null,
        durationMin: 500
      })
    ]);
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      tail: UNKNOWN_TAIL,
      from: places.austin,
      to: places.sanJose
    });
  });

  it('keeps a flight with an unknown place, nulls that end and warns once per name', () => {
    const { flights, logger } = run([
      ev('takeoff', '2026-09-01T14:00:00.000Z', 'Atlantis, Ocean, Nowhere'),
      ev('landing', '2026-09-01T16:00:00.000Z', AUSTIN),
      ev('takeoff', '2026-09-02T14:00:00.000Z', AUSTIN),
      ev('landing', '2026-09-02T16:00:00.000Z', 'Atlantis, Ocean, Nowhere')
    ]);
    expect(flights).toHaveLength(2);
    expect(
      flights.find((f) => f.departedAt?.startsWith('2026-09-01'))?.from
    ).toBeNull();
    expect(
      flights.find((f) => f.departedAt?.startsWith('2026-09-02'))?.to
    ).toBeNull();
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0].meta).toEqual({
      place: 'Atlantis, Ocean, Nowhere'
    });
  });

  it('attaches fuel only through the landing’s URI', () => {
    const landing = ev('landing', '2026-09-01T16:00:00.000Z', SAN_JOSE);
    const { flights } = run(
      [ev('takeoff', '2026-09-01T14:00:00.000Z', AUSTIN), landing],
      { fuelByParentUri: new Map([['at://someone/else', fuel]]) }
    );
    expect(flights[0].fuel).toBeNull();
  });

  it('produces flights that satisfy the FlightSource shape rules', () => {
    const { flights } = run(
      [
        ev('landing', '2026-09-01T09:00:00.000Z', HAWTHORNE),
        ev('takeoff', '2026-09-01T14:00:00.000Z', AUSTIN),
        ev('landing', '2026-09-01T16:00:00.000Z', SAN_JOSE),
        ev('takeoff', '2026-09-30T12:00:00.000Z', SAN_JOSE)
      ],
      { now: new Date('2026-09-30T13:00:00.000Z') }
    );
    expect(flights).toHaveLength(3);
    assertFlightShape(flights);
  });
});
