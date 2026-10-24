import { type Flight, type Fuel, type Place, UNKNOWN_TAIL } from '../../domain';
import type { Logger, PlaceResolver } from '../../ports';
import { recordKey } from './feed-client';
import type { JetEvent } from './parse';

export type PairOptions = {
  fuelByParentUri: ReadonlyMap<string, Fuel>;
  resolver: PlaceResolver;
  now: Date;
  logger: Logger;
  postUrl: (uri: string) => string | null;
};

const HOUR_MS = 60 * 60_000;
const PAIR_WINDOW_MS = 24 * HOUR_MS;
const AIRBORNE_MS = 18 * HOUR_MS;
const DURATION_TOLERANCE_MIN = 60;

const gapMs = (from: JetEvent, to: JetEvent) =>
  Date.parse(to.at) - Date.parse(from.at);

const gapMinutes = (from: JetEvent, to: JetEvent) =>
  Math.round(gapMs(from, to) / 60_000);

const pairsWith = (
  takeoff: JetEvent,
  next: JetEvent | undefined
): next is JetEvent => {
  if (next?.kind !== 'landing') return false;
  const gap = gapMs(takeoff, next);
  const fitsPostedTime =
    next.durationMin === null ||
    Math.abs(gapMinutes(takeoff, next) - next.durationMin) <=
      DURATION_TOLERANCE_MIN;
  return gap >= 0 && gap <= PAIR_WINDOW_MS && fitsPostedTime;
};

const isStillAirborne = (
  takeoff: JetEvent,
  next: JetEvent | undefined,
  now: Date
) => next === undefined && now.getTime() - Date.parse(takeoff.at) < AIRBORNE_MS;

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
      const next = evs[i + 1];
      if (e.kind === 'landing') {
        flights.push(flight(e, null, e, e.durationMin));
      } else if (pairsWith(e, next)) {
        flights.push(
          flight(e, e, next, next.durationMin ?? gapMinutes(e, next))
        );
        i++;
      } else if (isStillAirborne(e, next, now)) {
        flights.push(flight(e, e, null, null));
      }
    }
  }
  return flights;
};
