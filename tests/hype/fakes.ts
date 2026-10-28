import type { DayViews } from '../../src/hype/domain';
import { InMemoryPageviewSource } from '../../src/hype/sources/memory/in-memory-pageview-source';
import { parseItems } from '../../src/hype/sources/wikimedia/parse';
import capture from '../fixtures/wikimedia-pageviews.json';

export { InMemoryPageviewSource };

export const day = (date: string, views: number): DayViews => ({ date, views });

export const capturedDays = (): DayViews[] => parseItems(capture.items);
