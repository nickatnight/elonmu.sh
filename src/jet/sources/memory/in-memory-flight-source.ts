import { type Attribution, type Flight, flightTime } from '../../domain';
import type { FlightSource } from '../../ports';

const defaultAttribution: Attribution = {
  label: 'Sample flight data',
  url: 'https://elonmu.sh/jet'
};

export class InMemoryFlightSource implements FlightSource {
  readonly attribution: Attribution;
  private readonly error: Error | null;

  constructor(
    private readonly flights: readonly Flight[],
    options: { attribution?: Attribution; error?: Error } = {}
  ) {
    this.attribution = options.attribution ?? defaultAttribution;
    this.error = options.error ?? null;
  }

  async fetchFlights(since: Date): Promise<Flight[]> {
    if (this.error) throw this.error;
    return this.flights.filter((f) => {
      const at = flightTime(f);
      return at !== null && Date.parse(at) >= since.getTime();
    });
  }
}
