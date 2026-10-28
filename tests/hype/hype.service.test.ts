import { describe, expect, it } from 'bun:test';
import type { DayViews } from '../../src/hype/domain';
import { HypeService } from '../../src/hype/hype.service';
import type { PageviewSource } from '../../src/hype/ports';
import { FakeClock } from '../fakes';
import { capturedDays, day, InMemoryPageviewSource } from './fakes';

class RecordingSource implements PageviewSource {
  readonly requests: { from: string; to: string }[] = [];
  constructor(private readonly inner: PageviewSource) {}

  fetchDays(from: Date, to: Date): Promise<DayViews[]> {
    this.requests.push({ from: from.toISOString(), to: to.toISOString() });
    return this.inner.fetchDays(from, to);
  }
}

const NOW = '2026-10-27T09:12:44.000Z';

const seriesOf = (days: DayViews[], now = NOW) =>
  new HypeService(
    new InMemoryPageviewSource(days),
    new FakeClock(now)
  ).series();

const DAY_MS = 86_400_000;
const dateAfter = (start: string, n: number): string =>
  new Date(Date.parse(`${start}T00:00:00.000Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);

const flatYear = (views = 100): DayViews[] =>
  Array.from({ length: 365 }, (_, i) => day(dateAfter('2025-10-27', i), views));

const withViews = (days: DayViews[], set: Record<string, number>) =>
  days.map((d) => (d.date in set ? day(d.date, set[d.date]) : d));

describe('HypeService window', () => {
  it.each([
    ['mid-morning', NOW, '2025-10-27', '2026-10-26'],
    [
      'just after midnight UTC',
      '2026-10-27T00:00:01.000Z',
      '2025-10-27',
      '2026-10-26'
    ],
    [
      'just before midnight UTC',
      '2026-10-26T23:59:59.000Z',
      '2025-10-26',
      '2026-10-25'
    ]
  ])(
    'asks for the 365 days ending yesterday in UTC, %s',
    async (_when, now, from, to) => {
      const source = new RecordingSource(new InMemoryPageviewSource([]));
      await new HypeService(source, new FakeClock(now)).series();
      expect(source.requests).toEqual([
        { from: `${from}T00:00:00.000Z`, to: `${to}T00:00:00.000Z` }
      ]);
    }
  );

  it('reports the first and last days it actually got', async () => {
    const days = capturedDays().filter(
      (d) => d.date !== '2025-10-27' && d.date !== '2026-10-26'
    );
    const series = await seriesOf(days);
    expect(series.from).toBe('2025-10-28');
    expect(series.to).toBe('2026-10-25');
  });

  it('returns the days oldest first, with the article, attribution and time', async () => {
    const series = await seriesOf(capturedDays());
    expect(series.days).toHaveLength(365);
    expect(series.days[0]).toEqual(day('2025-10-27', 19194));
    expect(series.article).toBe('Elon Musk');
    expect(series.attribution.url).toBe(
      'https://pageviews.wmcloud.org/?project=en.wikipedia.org&pages=Elon_Musk'
    );
    expect(series.updatedAt).toBe(NOW);
  });
});

describe('HypeService stats', () => {
  it('takes the middle day as the median of an odd count', async () => {
    const days = [
      day('2026-10-01', 5),
      day('2026-10-02', 1),
      day('2026-10-03', 3)
    ];
    expect((await seriesOf(days)).stats.median).toBe(3);
  });

  it('rounds the mean of the two middle days for an even count', async () => {
    const days = [
      day('2026-10-01', 1),
      day('2026-10-02', 2),
      day('2026-10-03', 3),
      day('2026-10-04', 10)
    ];
    expect((await seriesOf(days)).stats.median).toBe(3);
  });

  it('reports a whole median when Wikimedia returns 364 days', async () => {
    const { stats } = await seriesOf(capturedDays().slice(1));
    expect(stats.median).toBe(20804);
  });

  it('sums the total and names the peak day', async () => {
    const days = [
      day('2026-10-01', 5),
      day('2026-10-02', 40),
      day('2026-10-03', 3)
    ];
    const { stats } = await seriesOf(days);
    expect(stats.total).toBe(48);
    expect(stats.peak).toEqual(day('2026-10-02', 40));
  });

  it('finds the June 2026 peak in the captured year', async () => {
    const { stats } = await seriesOf(capturedDays());
    expect(stats.peak).toEqual(day('2026-06-12', 194434));
    expect(stats.median).toBe(20803);
  });
});

describe('HypeService spikes', () => {
  it('marks the five biggest days, highest first, as multiples of the median', async () => {
    const days = withViews(flatYear(), {
      '2026-01-01': 300,
      '2026-02-01': 950,
      '2026-03-01': 420,
      '2026-04-01': 210,
      '2026-05-01': 1000,
      '2026-06-01': 200
    });
    expect((await seriesOf(days)).spikes).toEqual([
      { date: '2026-05-01', views: 1000, timesMedian: 10 },
      { date: '2026-02-01', views: 950, timesMedian: 9.5 },
      { date: '2026-03-01', views: 420, timesMedian: 4.2 },
      { date: '2026-01-01', views: 300, timesMedian: 3 },
      { date: '2026-04-01', views: 210, timesMedian: 2.1 }
    ]);
  });

  it('counts three adjacent high days as one spike', async () => {
    const days = withViews(flatYear(), {
      '2026-06-12': 900,
      '2026-06-13': 800,
      '2026-06-14': 700
    });
    const spikes = (await seriesOf(days)).spikes;
    expect(spikes[0]).toEqual({
      date: '2026-06-12',
      views: 900,
      timesMedian: 9
    });
    expect(spikes.map((s) => s.date)).not.toContain('2026-06-13');
    expect(spikes.map((s) => s.date)).not.toContain('2026-06-14');
  });

  it('allows a spike exactly 7 days from a higher one, not 6', async () => {
    const days = withViews(flatYear(), {
      '2026-06-10': 900,
      '2026-06-16': 800,
      '2026-06-17': 700
    });
    const dates = (await seriesOf(days)).spikes.map((s) => s.date);
    expect(dates.slice(0, 2)).toEqual(['2026-06-10', '2026-06-17']);
  });

  it('measures spikes against the rounded median', async () => {
    const days = [
      day('2026-10-01', 1),
      day('2026-10-02', 2),
      day('2026-10-03', 3),
      day('2026-10-04', 10)
    ];
    expect((await seriesOf(days)).spikes[0]).toEqual({
      date: '2026-10-04',
      views: 10,
      timesMedian: 3.3
    });
  });

  it('rounds timesMedian to one decimal', async () => {
    const days = withViews(flatYear(30), { '2026-06-12': 281 });
    expect((await seriesOf(days)).spikes[0].timesMedian).toBe(9.4);
  });

  it('keeps every spike in the captured year at least 7 days from the others', async () => {
    const { spikes } = await seriesOf(capturedDays());
    expect(spikes).toHaveLength(5);
    expect(spikes[0]).toEqual({
      date: '2026-06-12',
      views: 194434,
      timesMedian: 9.3
    });
    for (const a of spikes)
      for (const b of spikes)
        if (a !== b)
          expect(
            Math.abs(Date.parse(a.date) - Date.parse(b.date))
          ).toBeGreaterThanOrEqual(7 * DAY_MS);
  });

  it('returns fewer than five spikes when there are fewer days', async () => {
    const days = [day('2026-10-01', 5), day('2026-10-20', 9)];
    expect((await seriesOf(days)).spikes.map((s) => s.date)).toEqual([
      '2026-10-20',
      '2026-10-01'
    ]);
  });
});

describe('HypeService with no days', () => {
  it('returns empty spikes and zeroed stats instead of throwing', async () => {
    const series = await seriesOf([]);
    expect(series.days).toEqual([]);
    expect(series.spikes).toEqual([]);
    expect(series.stats).toEqual({ total: 0, median: 0, peak: null });
    expect(series.from).toBe('2025-10-27');
    expect(series.to).toBe('2026-10-26');
  });

  it('returns no spikes when the median day had no views', async () => {
    const days = [
      day('2026-10-01', 0),
      day('2026-10-02', 0),
      day('2026-10-03', 7)
    ];
    expect((await seriesOf(days)).spikes).toEqual([]);
  });
});
