import type { OrbitCatalog } from '../../domain';
import type { OrbitSource } from '../../ports';

export class InMemoryOrbitSource implements OrbitSource {
  private readonly error: Error | null;

  constructor(
    private readonly catalog: OrbitCatalog,
    options: { error?: Error } = {}
  ) {
    this.error = options.error ?? null;
  }

  async fetchOrbits(): Promise<OrbitCatalog> {
    if (this.error) throw this.error;

    return {
      readAt: this.catalog.readAt,
      satellites: this.catalog.satellites.map((s) => ({ ...s }))
    };
  }
}
