import type { Clock, HttpGet } from '../../../ports';
import type { OrbitCatalog } from '../../domain';
import type { OrbitSource } from '../../ports';
import { parseGp } from './parse-gp';

export const GP_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json';

export class CelesTrakOrbitSource implements OrbitSource {
  constructor(private readonly deps: { http: HttpGet; clock: Clock }) {}

  async fetchOrbits(): Promise<OrbitCatalog> {
    const satellites = parseGp(await this.deps.http<unknown>(GP_URL));

    return { readAt: this.deps.clock.now().toISOString(), satellites };
  }
}
