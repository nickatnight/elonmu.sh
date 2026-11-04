import type { Clock, HttpGet } from '../../../ports';
import type { ReentryLog } from '../../domain';
import type { ReentrySource } from '../../ports';
import { parseSatcat } from './parse-satcat';

export const SATCAT_URL =
  'https://celestrak.org/satcat/records.php?NAME=STARLINK&FORMAT=json';

export class CelesTrakReentrySource implements ReentrySource {
  constructor(private readonly deps: { http: HttpGet; clock: Clock }) {}

  async fetchReentries(): Promise<ReentryLog> {
    const reentries = parseSatcat(await this.deps.http<unknown>(SATCAT_URL));

    return { readAt: this.deps.clock.now().toISOString(), reentries };
  }
}
