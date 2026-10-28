import { describe, expect, it } from 'bun:test';
import {
  type ChartGeometry,
  type ChartSeries,
  type SpikeMark,
  seismograph
} from '../../src/hype/chart';
import type { DayViews, Spike } from '../../src/hype/domain';
import { capturedDays, day, sampleHype } from './fakes';

const DAY_MS = 86_400_000;
const dateAfter = (start: string, n: number): string =>
  new Date(Date.parse(`${start}T00:00:00.000Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);

const MEDIAN = 100;

const seriesOf = (
  days: DayViews[],
  spikes: Spike[] = [],
  median = MEDIAN
): ChartSeries => ({
  from: days[0]?.date ?? '2025-10-27',
  to: days.at(-1)?.date ?? '2026-10-26',
  days,
  stats: { total: 0, median, peak: null },
  spikes
});

const flatYear = (overrides: Record<string, number> = {}): DayViews[] =>
  Array.from({ length: 365 }, (_, i) => {
    const date = dateAfter('2025-10-27', i);
    return day(date, overrides[date] ?? MEDIAN);
  });

type Needle = { x: number; y0: number; y1: number };

const needles = (path: string): Needle[] =>
  [...path.matchAll(/M(-?[\d.]+) (-?[\d.]+)V(-?[\d.]+)/g)].map(
    ([, x, y0, y1]) => ({ x: Number(x), y0: Number(y0), y1: Number(y1) })
  );

const gridY = (chart: ChartGeometry, label: string): number => {
  const line = chart.gridlines.find((g) => g.label === label);
  if (!line) throw new Error(`no ${label} gridline`);
  return line.y;
};

const needleAt = (chart: ChartGeometry, index: number): Needle =>
  [...needles(chart.normalPath), ...needles(chart.hotPath)].sort(
    (a, b) => a.x - b.x
  )[index];

const spike = (date: string, views: number): Spike => ({
  date,
  views,
  timesMedian: Math.round((views / MEDIAN) * 10) / 10
});

describe('seismograph scale', () => {
  const chart = seismograph(
    seriesOf(flatYear({ '2026-01-10': 200, '2026-06-12': 930 })),
    'wide'
  );

  it('draws a normal day as a needle of no height on the 1× baseline', () => {
    const first = needleAt(chart, 0);
    expect(first.y0).toBe(chart.baselineY);
    expect(first.y1).toBe(chart.baselineY);
    expect(gridY(chart, '1×')).toBe(chart.baselineY);
  });

  it('puts 2× exactly one gridline step above the baseline', () => {
    const step = gridY(chart, '½×') - gridY(chart, '1×');
    expect(step).toBeGreaterThan(0);
    expect(gridY(chart, '2×')).toBeCloseTo(chart.baselineY - step, 1);
    const twice = needles(chart.hotPath).find(
      (n) => Math.abs(n.y1 - gridY(chart, '2×')) < 0.11
    );
    expect(twice).toBeDefined();
  });

  it.each([
    [9.3, 16, ['½×', '1×', '2×', '4×', '8×', '16×']],
    [8, 8, ['½×', '1×', '2×', '4×', '8×']],
    [3, 4, ['½×', '1×', '2×', '4×']],
    [1.5, 4, ['½×', '1×', '2×', '4×']]
  ])('tops out at %d× peak with %d×', (peak, top, labels) => {
    const c = seismograph(
      seriesOf(flatYear({ '2026-06-12': peak * MEDIAN })),
      'wide'
    );
    expect(c.top).toBe(top);
    expect(c.gridlines.map((g) => g.label)).toEqual(labels);
  });

  it('clamps days quieter than ½× to the ½× line', () => {
    const c = seismograph(
      seriesOf(flatYear({ '2025-10-27': 10, '2025-10-28': 50 })),
      'wide'
    );
    expect(needleAt(c, 0).y1).toBe(gridY(c, '½×'));
    expect(needleAt(c, 1).y1).toBe(gridY(c, '½×'));
  });
});

describe('seismograph needles', () => {
  it('draws one needle per day, in date order across the width', () => {
    const chart = seismograph(seriesOf(flatYear()), 'wide');
    const all = needles(chart.normalPath);
    expect(all).toHaveLength(365);
    for (let i = 1; i < all.length; i++)
      expect(all[i].x).toBeGreaterThan(all[i - 1].x);
  });

  it('puts days at 2× or more in the hot path only', () => {
    const chart = seismograph(
      seriesOf(
        flatYear({ '2026-01-01': 199, '2026-02-01': 200, '2026-03-01': 900 })
      ),
      'wide'
    );
    expect(needles(chart.hotPath)).toHaveLength(2);
    expect(needles(chart.normalPath)).toHaveLength(363);
  });

  it('leaves the gap for a missing day instead of closing it up', () => {
    const days = flatYear().filter((d) => d.date !== '2026-04-27');
    const chart = seismograph(seriesOf(days), 'wide');
    const xs = needles(chart.normalPath).map((n) => n.x);
    const gaps = xs.slice(1).map((x, i) => Math.round((x - xs[i]) * 10));
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(2 * Math.min(...gaps));
  });
});

describe('seismograph labels', () => {
  it('labels every month on the wide chart and only quarter months on the narrow one', () => {
    const series = seriesOf(flatYear());
    expect(seismograph(series, 'wide').months.map((m) => m.label)).toEqual([
      'Nov',
      'Dec',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct'
    ]);
    expect(seismograph(series, 'narrow').months.map((m) => m.label)).toEqual([
      'Jan',
      'Apr',
      'Jul',
      'Oct'
    ]);
  });

  it('marks five spikes on the wide chart and the top three on the narrow one', async () => {
    const series = await sampleHype(capturedDays()).series();
    const wide = seismograph(series, 'wide');
    const narrow = seismograph(series, 'narrow');
    expect(wide.spikes.map((s) => s.label.text)).toEqual([
      '12 Jun · 9.3×',
      '1 Dec · 2.9×',
      '17 Oct · 2.8×',
      '7 Nov · 2.4×',
      '4 Feb · 2.1×'
    ]);
    expect(narrow.spikes.map((s) => s.label.text)).toEqual([
      '12 Jun · 9.3×',
      '1 Dec · 2.9×',
      '17 Oct · 2.8×'
    ]);
  });

  it('puts each spike dot on the tip of its needle', () => {
    const chart = seismograph(
      seriesOf(flatYear({ '2026-06-12': 900 }), [spike('2026-06-12', 900)]),
      'wide'
    );
    const [dot] = chart.spikes;
    const tip = needles(chart.hotPath)[0];
    expect({ x: dot.x, y: dot.y }).toEqual({ x: tip.x, y: tip.y1 });
  });

  it('stacks a label upwards when it would overlap a higher spike’s label', () => {
    const views = { '2026-06-12': 900, '2026-06-19': 880 };
    const chart = seismograph(
      seriesOf(flatYear(views), [
        spike('2026-06-12', 900),
        spike('2026-06-19', 880)
      ]),
      'wide'
    );
    const [first, second] = chart.spikes;
    expect(first.label.y - second.label.y).toBeGreaterThanOrEqual(
      chart.fontSize
    );
  });

  it('leaves labels of spikes far apart where they are', () => {
    const views = { '2026-01-12': 900, '2026-06-19': 880 };
    const chart = seismograph(
      seriesOf(flatYear(views), [
        spike('2026-01-12', 900),
        spike('2026-06-19', 880)
      ]),
      'wide'
    );
    for (const s of chart.spikes) expect(s.label.y).toBeLessThan(s.y);
    expect(chart.spikes[1].y - chart.spikes[1].label.y).toBe(
      chart.spikes[0].y - chart.spikes[0].label.y
    );
    for (const s of chart.spikes) expect(s.label.leader).toBeNull();
  });

  describe('when a label would cover a nearby higher spike’s dot', () => {
    const views = {
      '2026-01-12': 900,
      '2026-06-26': 290,
      '2026-06-19': 240
    };
    const chart = seismograph(
      seriesOf(flatYear(views), [
        spike('2026-01-12', 900),
        spike('2026-06-26', 290),
        spike('2026-06-19', 240)
      ]),
      'wide'
    );
    const [, higher, lower] = chart.spikes;

    it('stacks the label upwards, clear of that dot', () => {
      expect(lower.label.y).toBeLessThan(higher.y - 3);
    });

    it('draws a leader from the label down to its own dot', () => {
      expect(lower.label.leader).toEqual({
        y1: expect.any(Number),
        y2: expect.any(Number)
      });
      const { y1, y2 } = lower.label.leader ?? { y1: 0, y2: 0 };
      expect(y1).toBeGreaterThan(lower.label.y);
      expect(y1).toBeLessThan(lower.y);
      expect(y2).toBeLessThan(y1);
    });
  });
});

type Box = { left: number; right: number; top: number; bottom: number };

const labelBox = (chart: ChartGeometry, mark: SpikeMark): Box => {
  const { x, y, text, anchor } = mark.label;
  const w = text.length * chart.fontSize * 0.6;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { left, right: left + w, top: y - chart.fontSize, bottom: y };
};

describe('seismograph labels on the captured year', () => {
  const CLEARANCE = 3;

  it.each(['wide', 'narrow'] as const)(
    'keeps every %s label off the other spikes’ dots',
    async (frame) => {
      const chart = seismograph(
        await sampleHype(capturedDays()).series(),
        frame
      );
      for (const mark of chart.spikes) {
        const box = labelBox(chart, mark);
        for (const other of chart.spikes) {
          if (other === mark) continue;
          const covered =
            other.x >= box.left - CLEARANCE &&
            other.x <= box.right + CLEARANCE &&
            other.y >= box.top - CLEARANCE &&
            other.y <= box.bottom + CLEARANCE;
          expect({ label: mark.label.text, dot: other.date, covered }).toEqual({
            label: mark.label.text,
            dot: other.date,
            covered: false
          });
        }
      }
    }
  );

  it.each(['wide', 'narrow'] as const)(
    'never lets two %s labels overlap',
    async (frame) => {
      const chart = seismograph(
        await sampleHype(capturedDays()).series(),
        frame
      );
      const boxes = chart.spikes.map((mark) => labelBox(chart, mark));
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, b] = [boxes[i], boxes[j]];
          const overlap =
            a.left < b.right &&
            b.left < a.right &&
            a.top < b.bottom &&
            b.top < a.bottom;
          expect(overlap).toBe(false);
        }
    }
  );
});

describe('seismograph bounds', () => {
  const crowded = flatYear({
    '2026-06-05': 800,
    '2026-06-12': 800,
    '2026-06-19': 800,
    '2026-06-26': 800,
    '2026-07-03': 800
  });
  const crowdedSpikes = Object.keys({
    '2026-06-05': 0,
    '2026-06-12': 0,
    '2026-06-19': 0,
    '2026-06-26': 0,
    '2026-07-03': 0
  }).map((date) => spike(date, 800));

  it.each([
    ['wide', 'the captured year'],
    ['narrow', 'the captured year'],
    ['wide', 'five stacked labels at the very top'],
    ['narrow', 'five stacked labels at the very top']
  ] as const)(
    'keeps every coordinate of the %s chart of %s inside the viewBox',
    async (frame, which) => {
      const series =
        which === 'the captured year'
          ? await sampleHype(capturedDays()).series()
          : seriesOf(crowded, crowdedSpikes);
      const c = seismograph(series, frame);
      const inside = (x: number, y: number) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(c.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(c.height);
      };
      for (const n of [...needles(c.normalPath), ...needles(c.hotPath)]) {
        inside(n.x, n.y0);
        inside(n.x, n.y1);
      }
      for (const g of c.gridlines) inside(c.plot.left, g.y);
      for (const m of c.months) inside(m.x, c.height - 1);
      for (const s of c.spikes) {
        inside(s.x, s.y);
        inside(s.label.x, s.label.y);
        expect(s.label.y - c.fontSize).toBeGreaterThanOrEqual(0);
      }
    }
  );

  it('is 720 units wide, or 360 for the narrow frame', () => {
    const series = seriesOf(flatYear());
    expect(seismograph(series, 'wide').width).toBe(720);
    expect(seismograph(series, 'narrow').width).toBe(360);
  });
});
