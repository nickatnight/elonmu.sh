import type { Fuel, IsoTimestamp } from '../../domain';

export type JetEvent = {
  kind: 'takeoff' | 'landing';
  tail: string | null;
  place: string;
  at: IsoTimestamp;
  durationMin: number | null;
  uri: string;
};

const TAIL = '(?:(N[0-9A-Z]{1,5}) )?';
const VERB = '(Took off|Landed)';
const PLACE_WITH_REGION = String.raw`(?:from|near|in) ([^,]+,.+?)\.`;
const FLIGHT_TIME = String.raw`(?: Apx\. flt\. time(?: (\d+) h)?(?: (\d+) min)?\.)?`;
const BOT_POST = new RegExp(
  `^${TAIL}${VERB} ${PLACE_WITH_REGION}${FLIGHT_TIME}\\s*$`
);

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

// The bot's occasional negative estimates are rejected.
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
