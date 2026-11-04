import { describe, expect, it } from 'bun:test';
import { inTimeZone } from './fakes';

const zoneInEffect = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('inTimeZone', () => {
  it('puts the local zone back, even when the run throws', async () => {
    const before = zoneInEffect();

    await expect(
      inTimeZone('Pacific/Kiritimati', () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(zoneInEffect()).toBe(before);
  });

  it('runs the callback in the zone it is given', async () => {
    expect(await inTimeZone('Pacific/Kiritimati', zoneInEffect)).toBe(
      'Pacific/Kiritimati'
    );
  });
});
