import { describe, expect, it } from 'bun:test';
import { GazetteerPlaceResolver } from '../../src/jet/places/gazetteer-place-resolver';
import places from '../../src/jet/places/places.json';
import { parseElonJetPost } from '../../src/jet/sources/bluesky/parse';
import {
  mergePlaces,
  missingPlaces,
  serializePlaces
} from '../../scripts/geocode-places';
import feedPages from '../fixtures/elonjet-feed.json';

const resolver = new GazetteerPlaceResolver(places);

describe('GazetteerPlaceResolver', () => {
  it('resolves a place exactly as posted to its name and coordinates', () => {
    const austin = resolver.resolve('Austin, Texas, United States');
    expect(austin?.name).toBe('Austin, Texas, United States');
    expect(austin?.lat).toBeCloseTo(30.27, 1);
    expect(austin?.lon).toBeCloseTo(-97.74, 1);
  });

  it('returns null for a place it does not know', () => {
    expect(resolver.resolve('Atlantis, Ocean, Nowhere')).toBeNull();
    // Lookups are exact: no fuzzy matching on case or spacing.
    expect(resolver.resolve('austin, texas, united states')).toBeNull();
  });

  it('rejects an entry with coordinates out of range', () => {
    expect(
      () => new GazetteerPlaceResolver({ 'Bad, Place, Here': [91, 0] })
    ).toThrow('Bad, Place, Here');
    expect(
      () => new GazetteerPlaceResolver({ 'Bad, Place, Here': [0, 181] })
    ).toThrow('Bad, Place, Here');
  });

  it('rejects an entry that is not a [lat, lon] pair', () => {
    expect(
      () => new GazetteerPlaceResolver({ 'Bad, Place, Here': [30] })
    ).toThrow('Bad, Place, Here');
  });
});

describe('places.json', () => {
  it('holds only in-range coordinates, keyed in sorted order', () => {
    const keys = Object.keys(places);
    expect(keys.length).toBeGreaterThan(40);
    expect(keys).toEqual([...keys].sort());
    for (const [lat, lon] of Object.values(places)) {
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
    }
  });

  it('resolves every place in the feed fixture', () => {
    const posted = feedPages
      .flatMap((page) => page.feed)
      .map((item) =>
        parseElonJetPost(
          item.post.record.text,
          item.post.record.createdAt,
          item.post.uri
        )
      )
      .flatMap((event) => (event ? [event.place] : []));
    expect(posted.length).toBeGreaterThan(40);
    for (const name of posted) {
      expect(resolver.resolve(name)).not.toBeNull();
    }
  });

  it('puts international places where they belong', () => {
    const near = (name: string, lat: number, lon: number) => {
      const p = resolver.resolve(name);
      expect(p).not.toBeNull();
      // Within about a degree: the city, not a namesake elsewhere.
      expect(Math.abs((p?.lat ?? 0) - lat)).toBeLessThan(1);
      expect(Math.abs((p?.lon ?? 0) - lon)).toBeLessThan(1);
    };
    near('Tokyo, Tōkyō Prefecture, Japan', 35.68, 139.69);
    near('New Delhi, Delhi (National Capital Territory), India', 28.61, 77.21);
    near('Zurich, Zürich, Switzerland', 47.37, 8.54);
  });
});

describe('geocode-places helpers', () => {
  const known = { 'Austin, Texas, United States': [30.27, -97.74] } as Record<
    string,
    [number, number]
  >;

  it('lists only the places not already known, once each', () => {
    expect(
      missingPlaces(
        [
          'Austin, Texas, United States',
          'Memphis, Tennessee, United States',
          'Memphis, Tennessee, United States'
        ],
        known
      )
    ).toEqual(['Memphis, Tennessee, United States']);
  });

  it('adds new places without touching existing ones, keys sorted', () => {
    const merged = mergePlaces(known, {
      'Austin, Texas, United States': [0, 0],
      'Albany, New York, United States': [42.65, -73.76]
    });
    expect(merged).toEqual({
      'Albany, New York, United States': [42.65, -73.76],
      'Austin, Texas, United States': [30.27, -97.74]
    });
    expect(Object.keys(merged)).toEqual([
      'Albany, New York, United States',
      'Austin, Texas, United States'
    ]);
  });

  it('is idempotent: merging again with nothing new changes nothing', () => {
    const once = mergePlaces(known, {});
    expect(mergePlaces(once, {})).toEqual(once);
    expect(missingPlaces(Object.keys(once), once)).toEqual([]);
  });

  it('writes places.json byte-for-byte as it is committed', async () => {
    const file = Bun.file(
      new URL('../../src/jet/places/places.json', import.meta.url)
    );
    const committed = await file.text();
    const known = (await file.json()) as Record<string, [number, number]>;
    expect(serializePlaces(mergePlaces(known, {}))).toBe(committed);
  });
});
