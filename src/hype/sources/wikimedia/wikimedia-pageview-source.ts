import type { HttpGet } from '../../../ports';
import { type DayViews, isoDate } from '../../domain';
import type { PageviewSource } from '../../ports';
import { parseItems } from './parse';

const DAILY_USER_VIEWS =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Elon_Musk/daily';

const compact = (at: Date): string => isoDate(at).replaceAll('-', '');

export const rangeUrl = (from: Date, to: Date): string =>
  `${DAILY_USER_VIEWS}/${compact(from)}/${compact(to)}`;

export class WikimediaPageviewSource implements PageviewSource {
  constructor(private readonly deps: { http: HttpGet }) {}

  async fetchDays(from: Date, to: Date): Promise<DayViews[]> {
    const body = await this.deps.http<{ items?: unknown }>(rangeUrl(from, to));
    const first = isoDate(from);
    const last = isoDate(to);
    return parseItems(body?.items).filter(
      (d) => d.date >= first && d.date <= last
    );
  }
}
