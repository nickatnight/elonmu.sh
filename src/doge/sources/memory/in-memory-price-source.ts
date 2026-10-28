import type { PriceQuote } from '../../domain';
import type { PriceSource } from '../../ports';

export class InMemoryPriceSource implements PriceSource {
  private readonly error: Error | null;

  constructor(
    private readonly quote: PriceQuote,
    options: { error?: Error } = {}
  ) {
    this.error = options.error ?? null;
  }

  async fetchPrice(): Promise<PriceQuote> {
    if (this.error) throw this.error;
    return { ...this.quote };
  }
}
