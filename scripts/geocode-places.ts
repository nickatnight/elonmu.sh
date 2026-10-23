// Offline, by hand: fills src/jet/places/places.json with coordinates for
// every place @elonjet.net has posted since a date (default: Jan 1 UTC).
//
//   bun scripts/geocode-places.ts [--since 2026-01-01]
//
// Run it when the server logs "jet: unknown place". Only missing places are
// looked up, through OpenStreetMap Nominatim at 1 request per second as its
// usage policy asks; existing entries are never changed, so hand fixes stick.
// Review the diff before committing: a namesake town can win a lookup.

import path from 'node:path';
import type { Gazetteer } from '../src/jet/places/gazetteer-place-resolver';
import { parseElonJetPost } from '../src/jet/sources/bluesky/parse';

type Coords = [number, number];

const PLACES_FILE = path.join(import.meta.dir, '../src/jet/places/places.json');
const FEED_URL =
  'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=elonjet.net&limit=100';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'elonmu.sh-geocode-places/1.0 (+https://elonmu.sh)';

// Distinct names not yet in the gazetteer, in first-seen order.
export const missingPlaces = (
  names: readonly string[],
  known: Gazetteer
): string[] => [...new Set(names)].filter((name) => !(name in known));

// `known` plus any new entries from `found`, keys sorted for stable diffs.
// Existing entries win, so hand-corrected coordinates are never overwritten.
export const mergePlaces = (
  known: Gazetteer,
  found: Gazetteer
): Record<string, Coords> => {
  const all = { ...found, ...known };
  return Object.fromEntries(
    Object.keys(all)
      .sort()
      .map((name) => [name, [all[name][0], all[name][1]]])
  );
};

// One `"name": [lat, lon]` per line: the layout Biome formats places.json
// to, so a run that finds nothing new leaves the file byte-for-byte equal.
export const serializePlaces = (places: Gazetteer): string => {
  const lines = Object.entries(places).map(
    ([name, [lat, lon]]) => `  ${JSON.stringify(name)}: [${lat}, ${lon}]`
  );
  return `{\n${lines.join(',\n')}\n}\n`;
};

type FeedPage = {
  cursor?: string;
  feed: {
    post: { uri: string; record: { text: string; createdAt: string } };
    reason?: unknown;
  }[];
};

// Every place named in bot posts since `since`, paging the public feed.
const postedPlaces = async (since: Date): Promise<string[]> => {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const url = cursor
      ? `${FEED_URL}&cursor=${encodeURIComponent(cursor)}`
      : FEED_URL;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`feed: HTTP ${res.status}`);
    const page = (await res.json()) as FeedPage;
    let older = false;
    for (const { post, reason } of page.feed) {
      if (reason) continue;
      const { text, createdAt } = post.record;
      if (Date.parse(createdAt) < since.getTime()) {
        older = true;
        continue;
      }
      const event = parseElonJetPost(text, createdAt, post.uri);
      if (event) names.push(event.place);
    }
    cursor = older ? undefined : page.cursor;
  } while (cursor);
  return names;
};

const geocode = async (name: string): Promise<Coords | null> => {
  const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`nominatim: HTTP ${res.status} for ${name}`);
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit
    ? [Number(Number(hit.lat).toFixed(4)), Number(Number(hit.lon).toFixed(4))]
    : null;
};

if (import.meta.main) {
  const sinceArg = process.argv.indexOf('--since');
  const since =
    sinceArg > 0
      ? new Date(process.argv[sinceArg + 1])
      : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  if (Number.isNaN(since.getTime())) throw new Error('bad --since date');

  const known = (await Bun.file(PLACES_FILE).json()) as Gazetteer;
  const missing = missingPlaces(await postedPlaces(since), known);
  console.log(
    `${missing.length} new place(s) since ${since.toISOString().slice(0, 10)}`
  );

  const found: Gazetteer = {};
  const failed: string[] = [];
  for (const name of missing) {
    const coords = await geocode(name);
    if (coords) {
      found[name] = coords;
      console.log(`  ${name} → ${coords.join(', ')}`);
    } else {
      failed.push(name);
    }
    await Bun.sleep(1100);
  }

  await Bun.write(PLACES_FILE, serializePlaces(mergePlaces(known, found)));
  if (failed.length) {
    console.warn(`no match (add by hand): ${failed.join(' | ')}`);
    process.exitCode = 1;
  }
}
