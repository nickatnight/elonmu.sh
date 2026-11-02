import type { ReentryLog } from '../../domain';
import type { ReentrySource } from '../../ports';

export class InMemoryReentrySource implements ReentrySource {
  private readonly error: Error | null;

  constructor(
    private readonly log: ReentryLog,
    options: { error?: Error } = {}
  ) {
    this.error = options.error ?? null;
  }

  async fetchReentries(): Promise<ReentryLog> {
    if (this.error) throw this.error;
    return {
      readAt: this.log.readAt,
      reentries: this.log.reentries.map((r) => ({ ...r }))
    };
  }
}
