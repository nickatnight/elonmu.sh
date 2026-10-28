import type { CitedPrice } from './domain';

// CoinGecko's public history stops at 365 days, so the price at showtime
// (11:30 pm EDT, 8 May 2021) is fixed here, cited to Binance's 1-minute
// DOGE/USDT candle for that minute. USDT is taken as USD.
export const SNL_SHOWTIME: CitedPrice = {
  at: '2021-05-09T03:30:00.000Z',
  usd: 0.67343,
  source: {
    label: 'Binance DOGE/USDT, 1-minute open at showtime',
    url: 'https://data-api.binance.vision/api/v3/klines?symbol=DOGEUSDT&interval=1m&startTime=1620531000000&limit=1'
  }
};
