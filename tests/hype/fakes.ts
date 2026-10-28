import type { DayViews } from '../../src/hype/domain';
import { HypeService } from '../../src/hype/hype.service';
import type { HypeQuery } from '../../src/hype/ports';
import { InMemoryPageviewSource } from '../../src/hype/sources/memory/in-memory-pageview-source';
import { parseItems } from '../../src/hype/sources/wikimedia/parse';
import { FakeClock } from '../fakes';
import capture from '../fixtures/wikimedia-pageviews.json';

export { InMemoryPageviewSource };

export const day = (date: string, views: number): DayViews => ({ date, views });

export const capturedDays = (): DayViews[] => parseItems(capture.items);

export const HYPE_NOW = '2026-10-27T09:12:44.000Z';

export const sampleHype = (days: DayViews[] = capturedDays()): HypeQuery =>
  new HypeService(new InMemoryPageviewSource(days), new FakeClock(HYPE_NOW));

export const failingHype = (): HypeQuery => ({
  series: () => Promise.reject(new Error('wikimedia down'))
});
