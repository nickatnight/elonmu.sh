import {
  type Flight,
  flightTime,
  type JetSnapshot,
  type Totals
} from './domain';
import type { Clock, FlightSource, JetQuery } from './ports';

// Minutes are summed first and converted once, so hours don't drift.
const sumTotals = (flights: Flight[]): Totals => {
  const t = { flights: 0, minutes: 0, gallons: 0, usd: 0, co2Tons: 0 };
  for (const f of flights) {
    t.flights += 1;
    t.minutes += f.durationMin ?? 0;
    t.gallons += f.fuel?.gallons ?? 0;
    t.usd += f.fuel?.usd ?? 0;
    t.co2Tons += f.fuel?.co2Tons ?? 0;
  }
  const { minutes, ...rest } = t;
  return { ...rest, hours: minutes / 60 };
};

// The core: this calendar year's (UTC) flights, newest first, with totals.
// Knows nothing about where the flights come from.
export class JetService implements JetQuery {
  constructor(
    private readonly source: FlightSource,
    private readonly clock: Clock
  ) {}

  async snapshot(): Promise<JetSnapshot> {
    const now = this.clock.now();
    const year = now.getUTCFullYear();
    const since = Date.UTC(year, 0, 1);

    // Re-check the year here rather than trusting each source's filter.
    const flights = (await this.source.fetchFlights(new Date(since)))
      .map((flight) => ({ flight, at: Date.parse(flightTime(flight) ?? '') }))
      .filter(({ at }) => at >= since)
      .sort((a, b) => b.at - a.at)
      .map(({ flight }) => flight);

    return {
      year,
      updatedAt: now.toISOString(),
      attribution: this.source.attribution,
      flights,
      totals: sumTotals(flights)
    };
  }
}
