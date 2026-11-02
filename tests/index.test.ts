import { describe, expect, it } from 'bun:test';
import pkg from '../package.json';
import type { JetQuery } from '../src/jet/ports';
import { createStarlinkModule } from '../src/starlink/index';
import { GP_URL } from '../src/starlink/sources/celestrak/celestrak-orbit-source';
import { SATCAT_URL } from '../src/starlink/sources/celestrak/celestrak-reentry-source';
import { warmUpCaches } from '../src/warm-up';
import { FakeClock, FakeLogger } from './fakes';
import gpCapture from './fixtures/celestrak-starlink-gp.json';
import satcatCapture from './fixtures/celestrak-starlink-satcat.json';
import { sampleJet } from './jet/fakes';

const captures: Record<string, unknown> = {
  [GP_URL]: gpCapture,
  [SATCAT_URL]: satcatCapture
};

const setup = () => {
  const celestrak: string[] = [];
  const starlink = createStarlinkModule({
    get: async (url) => {
      celestrak.push(url);
      return { data: captures[url] };
    },
    clock: new FakeClock('2026-10-30T04:30:00.000Z'),
    logger: new FakeLogger()
  });
  const inner = sampleJet();
  const counted = { jet: 0 };
  const jet: JetQuery = {
    snapshot: () => {
      counted.jet++;
      return inner.snapshot();
    }
  };
  return { celestrak, counted, modules: { jet, starlink } };
};

describe('warmUpCaches', () => {
  it('downloads both CelesTrak catalogues and the flights at start', async () => {
    const { celestrak, counted, modules } = setup();
    await warmUpCaches(modules, {});
    expect(celestrak).toEqual([GP_URL, SATCAT_URL]);
    expect(counted.jet).toBe(1);
  });

  it('skips CelesTrak, but still warms the flights, when SKIP_STARLINK_WARM_UP is 1', async () => {
    const { celestrak, counted, modules } = setup();
    await warmUpCaches(modules, { SKIP_STARLINK_WARM_UP: '1' });
    expect(celestrak).toEqual([]);
    expect(counted.jet).toBe(1);
  });

  it('warms Starlink for any other value of SKIP_STARLINK_WARM_UP', async () => {
    const { celestrak, modules } = setup();
    await warmUpCaches(modules, { SKIP_STARLINK_WARM_UP: '' });
    expect(celestrak).toEqual([GP_URL, SATCAT_URL]);
  });
});

describe('package scripts', () => {
  it('sets SKIP_STARLINK_WARM_UP for bun run dev, and not for bun start', () => {
    expect(pkg.scripts.dev).toBe(
      'SKIP_STARLINK_WARM_UP=1 bun --watch src/index.ts'
    );
    expect(pkg.scripts.start).toBe('bun src/index.ts');
  });
});
