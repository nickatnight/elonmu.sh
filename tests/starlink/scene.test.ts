import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  EARTH_RADIUS_KM,
  positionAt
} from '../../src/public/static/js/orbits.js';
import {
  animate,
  everyInterval,
  parseSatellites,
  placeParticles
} from '../../src/public/static/js/starlink.js';
import { sampleStarlink } from './fakes';

const apiBody = async (): Promise<unknown> =>
  JSON.parse(JSON.stringify(await sampleStarlink().snapshot()));

const AT = new Date('2026-10-30T04:30:00.000Z');

describe('parseSatellites', () => {
  it('reads every satellite in the /api/starlink body', async () => {
    const satellites = parseSatellites(await apiBody());

    expect(satellites).toHaveLength(200);
    expect(satellites[0]).toMatchObject({ id: 44714, name: 'STARLINK-1008' });
  });

  it('gives no satellites when the orbits are unavailable', async () => {
    const body = { ...((await apiBody()) as object), satellites: null };

    expect(parseSatellites(body)).toEqual([]);
  });

  it.each([
    ['a non-finite element', { meanMotion: 'fast' }],
    ['a missing epoch', { epoch: undefined }],
    ['an epoch that is not a date', { epoch: 'yesterday' }],
    ['an eccentricity of 1', { eccentricity: 1 }]
  ])('skips a satellite with %s', async (_name, change) => {
    const body = (await apiBody()) as { satellites: object[] };

    body.satellites[0] = { ...body.satellites[0], ...change };
    expect(parseSatellites(body)).toHaveLength(199);
  });

  it.each([
    ['an error body', { error: 'Starlink data is unavailable right now.' }],
    ['a string', 'oops'],
    ['null', null]
  ])('throws on %s', (_name, body) => {
    expect(() => parseSatellites(body)).toThrow();
  });
});

describe('placeParticles', () => {
  it('puts each satellite where orbits.js says, altitude in globe radii', async () => {
    const satellites = parseSatellites(await apiBody());
    const particles = placeParticles(satellites, AT);

    expect(particles).toHaveLength(200);
    const where = positionAt(satellites[7], AT);

    expect(particles[7]).toEqual({
      lat: where.lat,
      lng: where.lng,
      alt: where.altKm / EARTH_RADIUS_KM
    });
  });

  it('moves the same particles in place on the next call', async () => {
    const satellites = parseSatellites(await apiBody());
    const particles = placeParticles(satellites, AT);
    const first = particles[0];
    const before = { ...first };
    const again = placeParticles(
      satellites,
      new Date(AT.getTime() + 60_000),
      particles
    );

    expect(again).toBe(particles);
    expect(again[0]).toBe(first);
    expect(first.lng).not.toBe(before.lng);
  });
});

describe('placeParticles over a slice of the fleet', () => {
  it('moves only the satellites from the start index up to the end index', async () => {
    const satellites = parseSatellites(await apiBody());
    const particles = placeParticles(satellites, AT);
    const before = particles.map((p) => p.lng);

    placeParticles(
      satellites,
      new Date(AT.getTime() + 60_000),
      particles,
      50,
      100
    );
    const moved = particles
      .map((p, i) => (p.lng === before[i] ? null : i))
      .filter((i) => i !== null);

    expect(moved).toEqual(Array.from({ length: 50 }, (_, k) => 50 + k));
  });
});

describe('placeParticles at the end of the fleet', () => {
  it('stops at the last satellite when the slice runs past it', async () => {
    const satellites = parseSatellites(await apiBody());
    const particles = placeParticles(satellites, AT);

    expect(() =>
      placeParticles(satellites, AT, particles, 190, 250)
    ).not.toThrow();
    expect(particles).toHaveLength(200);
  });
});

const frames = () => {
  const queue: ((t: number) => void)[] = [];
  let requests = 0;

  return {
    request: (cb: (t: number) => void) => {
      requests++;
      queue.push(cb);

      return queue.length;
    },
    cancel: () => {
      queue.length = 0;
    },
    run(at: number) {
      const due = queue.splice(0);

      for (const cb of due) cb(at);
    },
    requested: () => requests
  };
};

describe('everyInterval', () => {
  it('runs at most once per interval, however fast frames come', () => {
    const f = frames();
    const ticks: number[] = [];

    everyInterval(1000, (t) => ticks.push(t), f);

    for (let t = 0; t <= 3000; t += 16) f.run(t);

    expect(ticks).toEqual([0, 1008, 2016]);
  });

  it('stops asking for frames once stopped', () => {
    const f = frames();
    const ticks: number[] = [];
    const stop = everyInterval(1000, (t) => ticks.push(t), f);

    f.run(0);
    stop();
    f.run(2000);
    expect(ticks).toEqual([0]);
  });
});

describe('starlink.js', () => {
  const source = readFileSync(
    path.join(import.meta.dir, '../../src/public/static/js/starlink.js'),
    'utf8'
  );

  it('writes to the page with textContent only', () => {
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });

  it('fetches only its own API', () => {
    expect([...source.matchAll(/fetch\('([^']*)'/g)].map(([, u]) => u)).toEqual(
      ['/api/starlink']
    );
  });
});

const recordingView = () => {
  const shown: { lat: number; lng: number; alt: number }[][] = [];

  return {
    shown,
    show: (particles: { lat: number; lng: number; alt: number }[]) => {
      shown.push(particles.map((p) => ({ ...p })));
    }
  };
};

describe('animate', () => {
  it('with reduced motion, places the dots once and asks for no frame', async () => {
    const satellites = parseSatellites(await apiBody());
    const f = frames();
    const view = recordingView();

    animate(view, satellites, {
      reducedMotion: true,
      frames: f,
      now: () => AT
    });
    expect(view.shown).toHaveLength(1);
    expect(view.shown[0]).toHaveLength(200);
    expect(f.requested()).toBe(0);
  });

  it('moves every satellite each second, showing the globe after every fourth 250 ms slice', async () => {
    const satellites = parseSatellites(await apiBody());
    const f = frames();
    const view = recordingView();
    let now = AT;

    animate(view, satellites, {
      reducedMotion: false,
      frames: f,
      now: () => now
    });
    now = new Date(AT.getTime() + 60_000);

    for (const t of [0, 250, 500]) f.run(t);

    expect(view.shown).toHaveLength(1);
    f.run(750);
    expect(view.shown).toHaveLength(2);
    const [first, second] = view.shown;
    const moved = second.filter((p, i) => p.lng !== first[i].lng);

    expect(moved).toHaveLength(200);
    expect(second).toEqual(placeParticles(satellites, now));
  });
});
