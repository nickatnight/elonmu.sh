import {
  type Attribution,
  type Flight,
  type Fuel,
  flightTime
} from '../../domain';
import type {
  Clock,
  FlightSource,
  HttpGet,
  Logger,
  PlaceResolver
} from '../../ports';
import { BlueskyFeedClient } from './feed-client';
import { pairFlights } from './pair';
import { type JetEvent, parseElonJetPost, parseFuelReply } from './parse';

export type BlueskyFlightSourceDeps = {
  http: HttpGet;
  resolver: PlaceResolver;
  logger: Logger;
  clock: Clock;
};

const ACTOR = 'elonjet.net';

// Flights from @elonjet.net's Bluesky posts: feed → parse → pair → places.
// The only module that knows the data comes from Bluesky.
export class BlueskyFlightSource implements FlightSource {
  readonly attribution: Attribution = {
    label: '@elonjet.net by Jack Sweeney',
    url: `https://bsky.app/profile/${ACTOR}`
  };

  private readonly feed: BlueskyFeedClient;
  private readonly resolver: PlaceResolver;
  private readonly clock: Clock;
  // Warns about each distinct problem once per process, not per refresh.
  private readonly logger: Logger;

  constructor({ http, resolver, logger, clock }: BlueskyFlightSourceDeps) {
    this.feed = new BlueskyFeedClient(http, ACTOR);
    this.resolver = resolver;
    this.clock = clock;
    const warned = new Set<string>();
    this.logger = {
      warn: (msg, meta) => {
        const key = `${msg} ${JSON.stringify(meta ?? {})}`;
        if (warned.has(key)) return;
        warned.add(key);
        logger.warn(msg, meta);
      }
    };
  }

  async fetchFlights(since: Date): Promise<Flight[]> {
    const items = await this.feed.postsSince(since);

    const events: JetEvent[] = [];
    const fuelByParentUri = new Map<string, Fuel>();
    for (const { post } of items) {
      const { text, createdAt, reply } = post.record;
      const event = parseElonJetPost(text, createdAt, post.uri);
      if (event) events.push(event);
      const fuel = reply ? parseFuelReply(text) : null;
      if (reply && fuel) fuelByParentUri.set(reply.parent.uri, fuel);
    }

    return pairFlights(events, {
      fuelByParentUri,
      resolver: this.resolver,
      now: this.clock.now(),
      logger: this.logger,
      postUrl: (uri) => {
        const rkey = uri.split('/').at(-1);
        return rkey && /^\w+$/.test(rkey)
          ? `https://bsky.app/profile/${ACTOR}/post/${rkey}`
          : null;
      }
    }).filter((f) => {
      const at = flightTime(f);
      return at !== null && Date.parse(at) >= since.getTime();
    });
  }
}
