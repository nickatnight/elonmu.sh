import type { Flight, Fuel, Place } from '../../domain';
import type { Logger, PlaceResolver } from '../../ports';
import { recordKey } from './feed-client';
import type { JetEvent } from './parse';

// The tail for the bot's older posts that name no aircraft. They are paired
// with each other, as if from one aircraft.
export const UNKNOWN_TAIL = 'Unknown';

export type PairOptions = {
  // Fuel estimates keyed by the URI of the landing post they reply to.
  fuelByParentUri: ReadonlyMap<string, Fuel>;
  resolver: PlaceResolver;
  now: Date;
  logger: Logger;
  // Public https: link for a post URI, or null.
  postUrl: (uri: string) => string | null;
};

const HOUR_MS = 60 * 60_000;
// A landing more than this long after a takeoff is a different flight.
const PAIR_WINDOW_MS = 24 * HOUR_MS;
// A takeoff with no landing yet counts as airborne for this long.
const AIRBORNE_MS = 18 * HOUR_MS;
// When the landing's posted flight time and the gap between the two posts
// disagree by more than this, events were missed in between: don't pair.
const DURATION_TOLERANCE_MIN = 60;

// Turns one account's takeoff and landing events into flights, per tail:
// - a takeoff and the tail's next event, a landing within 24 h whose posted
//   flight time fits the gap, make one flight;
// - any other landing is arrival-only (from: null);
// - any other takeoff is airborne if it is the tail's latest event and
//   under 18 h old, else dropped.
// Unknown places become null ends, with one warning per place name.
export const pairFlights = (
  events: readonly JetEvent[],
  options: PairOptions
): Flight[] => {
  const { fuelByParentUri, resolver, now, logger, postUrl } = options;

  const warned = new Set<string>();
  const place = (name: string): Place | null => {
    const found = resolver.resolve(name);
    if (!found && !warned.has(name)) {
      warned.add(name);
      logger.warn('jet: unknown place, add it to places.json', { place: name });
    }
    return found;
  };

  const byTail = new Map<string, JetEvent[]>();
  for (const e of events) {
    const tail = e.tail ?? UNKNOWN_TAIL;
    const list = byTail.get(tail);
    if (list) list.push(e);
    else byTail.set(tail, [e]);
  }

  const flights: Flight[] = [];
  for (const [tail, unsorted] of byTail) {
    const evs = [...unsorted].sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at)
    );

    const flight = (
      anchor: JetEvent,
      takeoff: JetEvent | null,
      landing: JetEvent | null,
      durationMin: number | null
    ): Flight => ({
      id: recordKey(anchor.uri),
      tail,
      from: takeoff ? place(takeoff.place) : null,
      to: landing ? place(landing.place) : null,
      departedAt: takeoff?.at ?? null,
      landedAt: landing?.at ?? null,
      durationMin,
      fuel: landing ? (fuelByParentUri.get(landing.uri) ?? null) : null,
      status: landing ? 'landed' : 'airborne',
      sourceUrl: postUrl(anchor.uri)
    });

    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.kind === 'landing') {
        flights.push(flight(e, null, e, e.durationMin));
        continue;
      }
      const next = evs[i + 1];
      if (next?.kind === 'landing') {
        const gapMs = Date.parse(next.at) - Date.parse(e.at);
        const gapMin = Math.round(gapMs / 60_000);
        const fits =
          next.durationMin === null ||
          Math.abs(gapMin - next.durationMin) <= DURATION_TOLERANCE_MIN;
        if (gapMs >= 0 && gapMs <= PAIR_WINDOW_MS && fits) {
          flights.push(flight(e, e, next, next.durationMin ?? gapMin));
          i++;
          continue;
        }
      }
      const latest = next === undefined;
      if (latest && now.getTime() - Date.parse(e.at) < AIRBORNE_MS) {
        flights.push(flight(e, e, null, null));
      }
    }
  }
  return flights;
};
