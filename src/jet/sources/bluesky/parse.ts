import type { Fuel } from '../../domain';

// One takeoff or landing as the @elonjet.net bot announces it.
export type JetEvent = {
  kind: 'takeoff' | 'landing';
  // null on the bot's older posts (before 2026-03-13), which name no aircraft.
  tail: string | null;
  // Exactly as posted: "City, Region, Country".
  place: string;
  // ISO 8601, UTC.
  at: string;
  // Landings only, when the bot gives an approximate flight time.
  durationMin: number | null;
  uri: string;
};

// "[N8628 ]Took off from|near PLACE." or
// "[N8628 ]Landed in|near PLACE.[ Apx. flt. time [H h][ M min].]"
// PLACE needs a comma ("City, Region, Country"), which rules out hand-typed
// posts like "Took off from Austin Texas"; the lazy match stops at the last
// full stop, so places like "St. Louis" keep theirs.
const BOT_POST =
  /^(?:(N[0-9A-Z]{1,5}) )?(Took off|Landed) (?:from|near|in) ([^,]+,.+?)\.(?: Apx\. flt\. time(?: (\d+) h)?(?: (\d+) min)?\.)?\s*$/;

// Parses one bot post. Anything else (hand-typed notes, chatter) is null.
export const parseElonJetPost = (
  text: string,
  createdAt: string,
  uri: string
): JetEvent | null => {
  const m = BOT_POST.exec(text);
  if (!m) return null;
  const time = Date.parse(createdAt);
  if (Number.isNaN(time)) return null;
  const [, tail, verb, place, hours, minutes] = m;
  const kind = verb === 'Landed' ? 'landing' : 'takeoff';
  const timed = hours !== undefined || minutes !== undefined;
  return {
    kind,
    tail: tail ?? null,
    place,
    at: new Date(time).toISOString(),
    durationMin: timed ? Number(hours ?? 0) * 60 + Number(minutes ?? 0) : null,
    uri
  };
};

const num = (s: string) => Number(s.replaceAll(',', ''));

// The bot's fuel reply under a landing:
// "~ 782 gallons (…). ~ 5,240 lbs (…) of jet fuel used. ~ $6,083 cost of
// fuel. ~ 8 tons of CO2 emissions." All three figures are required; the
// bot's occasional negative estimates are rejected.
export const parseFuelReply = (text: string): Fuel | null => {
  const gallons = /~ (-?[\d,]+(?:\.\d+)?) gallons/.exec(text)?.[1];
  const usd = /~ \$(-?[\d,]+(?:\.\d+)?) cost of fuel/.exec(text)?.[1];
  const co2 = /~ (-?[\d,]+(?:\.\d+)?) tons of CO2/.exec(text)?.[1];
  if (gallons === undefined || usd === undefined || co2 === undefined) {
    return null;
  }
  const fuel = { gallons: num(gallons), usd: num(usd), co2Tons: num(co2) };
  return Object.values(fuel).every((v) => Number.isFinite(v) && v >= 0)
    ? fuel
    : null;
};
