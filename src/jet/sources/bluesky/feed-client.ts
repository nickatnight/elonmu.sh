import type { HttpGet } from '../../../ports';

export type FeedItem = {
  post: {
    uri: string;
    author: { handle: string };
    record: {
      text: string;
      createdAt: string;
      reply?: { parent: { uri: string } };
    };
  };
  // Present on reposts of other accounts' posts.
  reason?: unknown;
};

export type FeedPage = { cursor?: string; feed: FeedItem[] };

export const recordKey = (uri: string): string => uri.split('/').at(-1) ?? uri;

const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';
const MAX_PAGES = 40;

export class BlueskyFeedClient {
  private readonly known = new Map<string, FeedItem>();
  private coveredSince = Number.POSITIVE_INFINITY;

  constructor(
    private readonly http: HttpGet,
    readonly actor = 'elonjet.net'
  ) {}

  async postsSince(since: Date): Promise<FeedItem[]> {
    const sinceMs = since.getTime();
    const canStopAtKnown = sinceMs >= this.coveredSince;
    const fresh: FeedItem[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${API}?actor=${encodeURIComponent(this.actor)}&limit=100${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      const { feed, cursor: next } = await this.http<FeedPage>(url);
      let done = !next;
      for (const item of feed) {
        if (item.reason) continue;
        const createdMs = Date.parse(item.post.record.createdAt);
        if (createdMs < sinceMs) done = true;
        else if (this.known.has(item.post.uri) && canStopAtKnown) done = true;
        else fresh.push(item);
      }
      if (done) break;
      cursor = next;
    }

    for (const item of fresh) this.known.set(item.post.uri, item);
    this.coveredSince = Math.min(this.coveredSince, sinceMs);
    return [...this.known.values()]
      .filter((item) => Date.parse(item.post.record.createdAt) >= sinceMs)
      .sort(
        (a, b) =>
          Date.parse(b.post.record.createdAt) -
          Date.parse(a.post.record.createdAt)
      );
  }
}
