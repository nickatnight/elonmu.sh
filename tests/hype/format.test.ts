import { describe, expect, it } from 'bun:test';
import { hypePage } from '../../src/hype/format';
import { capturedDays, day, sampleHype } from './fakes';

describe('hypePage on the captured year', async () => {
  const page = hypePage(await sampleHype(capturedDays()).series());
  if (page.state !== 'loaded') throw new Error('expected a loaded page');

  it('summarises the chart for screen readers', () => {
    expect(page.summary).toBe(
      'Daily views, 27 Oct 2025 – 26 Oct 2026, peak 194,434 on 12 Jun 2026'
    );
  });

  it("states a normal day, the peak and the year's total in millions", () => {
    expect(page.stats).toEqual([
      { value: '20,803', label: 'views on a normal day' },
      { value: '194,434', label: 'peak, 12 Jun 2026' },
      { value: '8.7M', label: 'views in the last year' }
    ]);
  });

  it('lists the five spikes with their date, views and size', () => {
    expect(page.spikes[0]).toEqual({
      datetime: '2026-06-12',
      date: '12 Jun 2026',
      views: '194,434 views',
      size: '9.3× a normal day'
    });
    expect(page.spikes.map((s) => s.date)).toEqual([
      '12 Jun 2026',
      '1 Dec 2025',
      '17 Oct 2026',
      '7 Nov 2025',
      '4 Feb 2026'
    ]);
  });

  it('carries a wide and a narrow chart', () => {
    expect(page.charts.wide.width).toBe(720);
    expect(page.charts.narrow.width).toBe(360);
  });

  it('credits Wikimedia', () => {
    expect(page.attribution.label).toBe(
      'Wikimedia pageviews (en.wikipedia, users only)'
    );
  });
});

describe('hypePage edge cases', () => {
  it('is empty when there are no days', async () => {
    expect(hypePage(await sampleHype([]).series())).toEqual({
      state: 'empty'
    });
  });

  it('rounds an even-count median to a whole number of views', async () => {
    const page = hypePage(
      await sampleHype([day('2026-10-25', 1), day('2026-10-26', 2)]).series()
    );
    if (page.state !== 'loaded') throw new Error('expected a loaded page');
    expect(page.stats[0].value).toBe('2');
  });

  it('keeps one decimal on a total of whole millions', async () => {
    const page = hypePage(
      await sampleHype([day('2026-10-26', 9_000_000)]).series()
    );
    if (page.state !== 'loaded') throw new Error('expected a loaded page');
    expect(page.stats[2].value).toBe('9.0M');
  });

  it('says "view" for a single view', async () => {
    const page = hypePage(await sampleHype([day('2026-10-26', 1)]).series());
    if (page.state !== 'loaded') throw new Error('expected a loaded page');
    expect(page.spikes[0].views).toBe('1 view');
  });
});
