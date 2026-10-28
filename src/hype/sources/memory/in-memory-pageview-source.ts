import { type DayViews, isoDate } from '../../domain';
import type { PageviewSource } from '../../ports';

export class InMemoryPageviewSource implements PageviewSource {
  private readonly error: Error | null;

  constructor(
    private readonly days: readonly DayViews[],
    options: { error?: Error } = {}
  ) {
    this.error = options.error ?? null;
  }

  async fetchDays(from: Date, to: Date): Promise<DayViews[]> {
    if (this.error) throw this.error;
    const first = isoDate(from);
    const last = isoDate(to);
    return this.days
      .filter((d) => d.date >= first && d.date <= last)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
