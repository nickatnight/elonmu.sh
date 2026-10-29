import { describe, expect, it } from 'bun:test';
import { CachedArticleSource } from '../../src/news/cached-article-source';
import type { Article } from '../../src/news/domain';
import { NewsService } from '../../src/news/news.service';
import type { ArticleSource } from '../../src/news/ports';
import { FakeClock, FakeLogger } from '../fakes';
import { describeArticleSource } from './article-source.contract';
import { article, InMemoryArticleSource } from './fakes';

const TTL = 15 * 60_000;

class ScriptedSource implements ArticleSource {
  calls = 0;
  failing = false;
  articles: Article[] = [article()];
  private gate: Promise<void> | null = null;
  private open: () => void = () => {};

  hold(): void {
    this.gate = new Promise((resolve) => {
      this.open = resolve;
    });
  }

  release(): void {
    this.open();
    this.gate = null;
  }

  async latest(): Promise<Article[]> {
    this.calls++;
    if (this.gate) await this.gate;
    if (this.failing) throw new Error('newsapi down');
    return this.articles;
  }
}

const setup = () => {
  const inner = new ScriptedSource();
  const clock = new FakeClock('2026-10-28T09:00:00.000Z');
  const logger = new FakeLogger();
  return {
    inner,
    clock,
    logger,
    cached: new CachedArticleSource(inner, clock, logger)
  };
};

describeArticleSource('CachedArticleSource around InMemoryArticleSource', {
  make: () =>
    new CachedArticleSource(
      new InMemoryArticleSource([article()]),
      new FakeClock('2026-10-28T09:00:00.000Z'),
      new FakeLogger()
    ),
  makeFailing: () =>
    new CachedArticleSource(
      new InMemoryArticleSource([article()], { error: new Error('down') }),
      new FakeClock('2026-10-28T09:00:00.000Z'),
      new FakeLogger()
    )
});

describe('CachedArticleSource', () => {
  it('serves a second call within 15 minutes without asking NewsAPI', async () => {
    const { inner, clock, cached } = setup();
    await cached.latest();
    clock.advance(TTL - 1);
    await cached.latest();
    expect(inner.calls).toBe(1);
  });

  it('asks again once 15 minutes have passed', async () => {
    const { inner, clock, cached } = setup();
    await cached.latest();
    clock.advance(TTL);
    inner.articles = [article({ title: 'fresher' })];
    expect((await cached.latest()).map((a) => a.title)).toEqual(['fresher']);
    expect(inner.calls).toBe(2);
  });

  it('shares one NewsAPI call between concurrent cold requests', async () => {
    const { inner, cached } = setup();
    inner.hold();
    const all = Promise.all(Array.from({ length: 20 }, () => cached.latest()));
    inner.release();
    const results = await all;
    expect(inner.calls).toBe(1);
    for (const result of results) expect(result).toEqual(inner.articles);
  });

  it('keeps an hour of requests every second to 4 NewsAPI calls', async () => {
    const { inner, clock, cached } = setup();
    const news = new NewsService(cached, Math.random);
    for (let second = 0; second < 3600; second++) {
      await Promise.all([news.random(), news.random(), news.random()]);
      clock.advance(1_000);
    }
    expect(inner.calls).toBe(4);
  });

  it('serves the last good articles on failure and warns', async () => {
    const { inner, clock, logger, cached } = setup();
    const good = await cached.latest();
    clock.advance(TTL);
    inner.failing = true;
    expect(await cached.latest()).toEqual(good);
    expect(logger.warnings).toEqual([
      {
        msg: 'news: refresh failed, serving stale articles',
        meta: {
          error: 'newsapi down',
          staleSince: '2026-10-28T09:00:00.000Z'
        }
      }
    ]);
  });

  it('throws the upstream error and warns when the first fetch fails', async () => {
    const { inner, logger, cached } = setup();
    inner.failing = true;
    await expect(cached.latest()).rejects.toThrow('newsapi down');
    expect(logger.warnings[0]?.msg).toBe(
      'news: refresh failed, no articles to serve'
    );
  });

  it('waits a minute after a failed refresh before asking NewsAPI again, serving stale meanwhile', async () => {
    const { inner, clock, logger, cached } = setup();
    const good = await cached.latest();
    clock.advance(TTL);
    inner.failing = true;
    for (let i = 0; i < 6; i++) {
      expect(await cached.latest()).toEqual(good);
      clock.advance(10_000);
    }
    expect(inner.calls).toBe(2);
    expect(logger.warnings).toHaveLength(1);
    await cached.latest();
    expect(inner.calls).toBe(3);
  });

  it('waits a minute after a failed cold fetch too, failing fast with the same error', async () => {
    const { inner, clock, cached } = setup();
    inner.failing = true;
    const first = await cached.latest().catch((err: unknown) => err);
    clock.advance(59_999);
    const second = await cached.latest().catch((err: unknown) => err);
    expect(second).toBe(first);
    expect(inner.calls).toBe(1);
    clock.advance(1);
    inner.failing = false;
    expect(await cached.latest()).toEqual(inner.articles);
    expect(inner.calls).toBe(2);
  });
});
