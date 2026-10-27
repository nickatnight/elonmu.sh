/**
 * @typedef {EventTarget & {
 *   paused: boolean, ended: boolean, currentTime: number, duration: number,
 *   preload: string, play(): Promise<void>, pause(): void, load(): void
 * }} Clip
 * @typedef {{ classList: { add(name: string): unknown } }} Stage
 * @typedef {EventTarget & {
 *   hidden: boolean, setAttribute(name: string, value: string): void
 * }} Toggle
 */

// The HTML spec lets browsers fire `timeupdate` as rarely as every 250 ms.
const TIMEUPDATE_INTERVAL_S = 0.25;

export const toSeconds = (/** @type {string} */ cssTime) => {
  const value = Number.parseFloat(cssTime);
  return cssTime.trim().endsWith('ms') ? value / 1000 : value;
};

/**
 * @param {{
 *   hero: Stage, launch: Clip, cruise: Clip, toggle: Toggle,
 *   fadeSeconds: number
 * }} parts
 */
export const startHeroPlayback = ({
  hero,
  launch,
  cruise,
  toggle,
  fadeSeconds
}) => {
  let handedOff = false;
  let userPaused = false;
  let onScreen = true;

  const liveClips = () => {
    if (!handedOff) return [launch];
    return launch.ended ? [cruise] : [launch, cruise];
  };

  const syncToggle = () => {
    toggle.setAttribute('aria-pressed', String(userPaused));
  };

  const updatePlayback = () => {
    if (userPaused || !onScreen) {
      for (const clip of liveClips()) clip.pause();
      return;
    }
    // A blocked autoplay (iOS Low Power Mode) leaves the toggle on play.
    // Other rejections, like a pending play() cut short by pause() when the
    // hero scrolls away, are not the viewer's choice and change nothing.
    for (const clip of liveClips()) {
      clip.play().catch((error) => {
        if (error.name !== 'NotAllowedError') return;
        userPaused = true;
        syncToggle();
      });
    }
  };

  const loadCruise = () => {
    cruise.preload = 'auto';
    cruise.load();
  };
  if (launch.paused) {
    launch.addEventListener('playing', loadCruise, { once: true });
  } else {
    loadCruise();
  }

  const handOff = () => {
    if (handedOff) return;
    handedOff = true;
    cruise.addEventListener(
      'playing',
      () => hero.classList.add('is-cruising'),
      { once: true }
    );
    updatePlayback();
  };

  launch.addEventListener('timeupdate', () => {
    const handoffAt = launch.duration - fadeSeconds - TIMEUPDATE_INTERVAL_S;
    if (launch.currentTime >= handoffAt) handOff();
  });
  launch.addEventListener('ended', handOff);

  toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    syncToggle();
    updatePlayback();
  });

  toggle.hidden = false;

  return {
    setOnScreen: (/** @type {boolean} */ visible) => {
      onScreen = visible;
      updatePlayback();
    }
  };
};

const start = () => {
  const hero = /** @type {HTMLElement} */ (document.querySelector('.hero'));
  const launch = /** @type {HTMLVideoElement} */ (
    hero.querySelector('.hero__video--launch')
  );
  const cruise = /** @type {HTMLVideoElement} */ (
    hero.querySelector('.hero__video--cruise')
  );
  const toggle = /** @type {HTMLButtonElement} */ (
    hero.querySelector('.hero__toggle')
  );

  // Drop the launch's sources to end the download.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    launch.pause();
    launch.replaceChildren();
    launch.load();
    return;
  }

  const playback = startHeroPlayback({
    hero,
    launch,
    cruise,
    toggle,
    fadeSeconds: toSeconds(
      getComputedStyle(hero).getPropertyValue('--hero-handoff')
    )
  });

  // Records can arrive batched (a fast scroll in and out): the last is current.
  new IntersectionObserver((entries) => {
    playback.setOnScreen(entries.at(-1)?.isIntersecting ?? false);
  }).observe(hero);
};

if (typeof document !== 'undefined') start();
