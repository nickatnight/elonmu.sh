import { describe, expect, it } from 'bun:test';
import { startHeroPlayback } from '../src/public/static/js/hero.js';

class FakeClip extends EventTarget {
  paused = true;
  ended = false;
  currentTime = 0;
  preload = 'none';
  plays = 0;
  loads = 0;
  playError: Error | null = null;

  constructor(readonly duration: number) {
    super();
  }

  play(): Promise<void> {
    this.plays += 1;
    if (this.playError) return Promise.reject(this.playError);
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  load(): void {
    this.loads += 1;
  }

  startsPlaying(): void {
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
  }

  ends(): void {
    this.currentTime = this.duration;
    this.ended = true;
    this.paused = true;
    this.dispatchEvent(new Event('ended'));
  }
}

class FakeToggle extends EventTarget {
  hidden = true;
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  press(): void {
    this.dispatchEvent(new Event('click'));
  }
}

const blocked = (name: string): Error =>
  Object.assign(new Error('play() was rejected'), { name });

const flushMicrotasks = () => Promise.resolve();

const setup = ({ autoplayStarted = true } = {}) => {
  const launch = new FakeClip(6.5);
  const cruise = new FakeClip(4.667);
  const toggle = new FakeToggle();
  const hero = { classList: new Set<string>() };
  launch.paused = !autoplayStarted;
  const playback = startHeroPlayback({ hero, launch, cruise, toggle });
  return { launch, cruise, toggle, hero, playback };
};

describe('hero playback', () => {
  it('shows the pause toggle once it starts', () => {
    const { toggle } = setup();
    expect(toggle.hidden).toBe(false);
  });

  it('loads the cruise right away when the launch is already playing', () => {
    const { cruise } = setup({ autoplayStarted: true });
    expect(cruise.preload).toBe('auto');
    expect(cruise.loads).toBe(1);
  });

  it('waits for the launch to play before loading the cruise', () => {
    const { launch, cruise } = setup({ autoplayStarted: false });
    expect(cruise.loads).toBe(0);
    launch.startsPlaying();
    expect(cruise.loads).toBe(1);
  });

  it('plays the cruise when the launch ends and shows it once it plays', () => {
    const { launch, cruise, hero } = setup();
    launch.ends();
    expect(cruise.paused).toBe(false);
    expect(hero.classList.has('is-cruising')).toBe(false);
    cruise.startsPlaying();
    expect(hero.classList.has('is-cruising')).toBe(true);
  });

  it('pauses and resumes the launch from the toggle', () => {
    const { launch, toggle } = setup();
    toggle.press();
    expect(launch.paused).toBe(true);
    expect(toggle.attributes.get('aria-pressed')).toBe('true');
    toggle.press();
    expect(launch.paused).toBe(false);
    expect(toggle.attributes.get('aria-pressed')).toBe('false');
  });

  it('pauses while the hero is off screen and resumes when it is back', () => {
    const { launch, playback } = setup();
    playback.setOnScreen(false);
    expect(launch.paused).toBe(true);
    playback.setOnScreen(true);
    expect(launch.paused).toBe(false);
  });

  it('leaves the toggle on play when autoplay is blocked', async () => {
    const { launch, toggle, playback } = setup();
    launch.playError = blocked('NotAllowedError');
    playback.setOnScreen(true);
    await flushMicrotasks();
    expect(toggle.attributes.get('aria-pressed')).toBe('true');
  });

  it('ignores a play() that a pause cut short', async () => {
    const { launch, toggle, playback } = setup();
    launch.playError = blocked('AbortError');
    playback.setOnScreen(true);
    await flushMicrotasks();
    expect(toggle.attributes.get('aria-pressed')).toBeUndefined();
  });
});
