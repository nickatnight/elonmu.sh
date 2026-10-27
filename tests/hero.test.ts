import { describe, expect, it } from 'bun:test';
import { startHeroPlayback, toSeconds } from '../src/public/static/js/hero.js';

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

  reaches(time: number): void {
    this.currentTime = time;
    this.dispatchEvent(new Event('timeupdate'));
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

const playRejection = (name: string): Error =>
  Object.assign(new Error('play() was rejected'), { name });

const flushMicrotasks = () => Promise.resolve();

const LAUNCH_S = 6.5;
const FADE_S = 0.4;
const TIMEUPDATE_INTERVAL_S = 0.25;
const HANDOFF_AT_S = LAUNCH_S - FADE_S - TIMEUPDATE_INTERVAL_S;
const DURING_OVERLAP_S = HANDOFF_AT_S + 0.1;

const setup = ({ autoplayStarted = true } = {}) => {
  const launch = new FakeClip(LAUNCH_S);
  const cruise = new FakeClip(4.667);
  const toggle = new FakeToggle();
  const hero = { classList: new Set<string>() };
  launch.paused = !autoplayStarted;
  const playback = startHeroPlayback({
    hero,
    launch,
    cruise,
    toggle,
    fadeSeconds: FADE_S
  });
  return { launch, cruise, toggle, hero, playback };
};

describe('toSeconds', () => {
  it('reads CSS times in milliseconds and seconds', () => {
    expect(toSeconds(' 400ms')).toBe(0.4);
    expect(toSeconds('0.4s')).toBe(0.4);
  });
});

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
    launch.playError = playRejection('NotAllowedError');
    playback.setOnScreen(true);
    await flushMicrotasks();
    expect(toggle.attributes.get('aria-pressed')).toBe('true');
  });

  it('keeps the cruise waiting until the launch is near its end', () => {
    const { launch, cruise } = setup();
    launch.reaches(HANDOFF_AT_S - 0.05);
    expect(cruise.paused).toBe(true);
  });

  it('starts the cruise with the fade and one timeupdate interval left', () => {
    const { launch, cruise } = setup();
    launch.reaches(HANDOFF_AT_S);
    expect(cruise.paused).toBe(false);
    expect(launch.paused).toBe(false);
  });

  it('fades the cruise in while the launch is still moving', () => {
    const { launch, cruise, hero } = setup();
    launch.reaches(DURING_OVERLAP_S);
    cruise.startsPlaying();
    expect(hero.classList.has('is-cruising')).toBe(true);
    expect(launch.paused).toBe(false);
  });

  it('hands off only once across timeupdates and the end', () => {
    const { launch, cruise } = setup();
    launch.reaches(DURING_OVERLAP_S);
    launch.reaches(DURING_OVERLAP_S + 0.25);
    launch.ends();
    expect(cruise.plays).toBe(1);
  });

  it('pauses and resumes both clips while they overlap', () => {
    const { launch, cruise, toggle } = setup();
    launch.reaches(DURING_OVERLAP_S);
    toggle.press();
    expect([launch.paused, cruise.paused]).toEqual([true, true]);
    toggle.press();
    expect([launch.paused, cruise.paused]).toEqual([false, false]);
  });

  it('pauses both clips if the hero scrolls away while they overlap', () => {
    const { launch, cruise, playback } = setup();
    launch.reaches(DURING_OVERLAP_S);
    playback.setOnScreen(false);
    expect([launch.paused, cruise.paused]).toEqual([true, true]);
  });

  it('resumes only the cruise once the launch has ended', () => {
    const { launch, cruise, toggle } = setup();
    launch.reaches(DURING_OVERLAP_S);
    launch.ends();
    const launchPlays = launch.plays;
    toggle.press();
    toggle.press();
    expect(cruise.paused).toBe(false);
    expect(launch.plays).toBe(launchPlays);
  });

  it('ignores a play() that a pause cut short', async () => {
    const { launch, toggle, playback } = setup();
    launch.playError = playRejection('AbortError');
    playback.setOnScreen(true);
    await flushMicrotasks();
    expect(toggle.attributes.get('aria-pressed')).toBeUndefined();
  });
});
