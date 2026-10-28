import type { HttpGet } from '../../../ports';
import type { PriceQuote } from '../../domain';
import type { PriceSource } from '../../ports';
import { parseSimplePrice } from './parse';

export const SIMPLE_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd&include_last_updated_at=true';

export class CoinGeckoPriceSource implements PriceSource {
  constructor(private readonly deps: { http: HttpGet }) {}

  async fetchPrice(): Promise<PriceQuote> {
    return parseSimplePrice(await this.deps.http<unknown>(SIMPLE_PRICE_URL));
  }
}
