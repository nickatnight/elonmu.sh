// elonmu.sh: the live console, copy buttons, hero clips, and section entrances.
const announce = (text) => {
  document.querySelector('.announce').textContent = text;
};

(() => {
  const $ = (selector) => document.querySelector(selector);
  const send = $('.console__send');
  const status = $('.console__status');
  const media = $('.card__media');
  const meta = $('.card__meta');
  const title = $('.card__title');
  const desc = $('.card__desc');
  const link = $('.card__link');
  const json = $('.json code');

  // Article fields come from third parties: text goes in with textContent,
  // and only http(s) URLs are ever used as a link or image source.
  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };

  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
  };

  const span = (className, text) => {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
  };

  const renderJson = (body) => {
    const entries = Object.entries(body);
    json.replaceChildren('{\n');
    entries.forEach(([key, value], i) => {
      json.append(
        '  ',
        span('tok-key', JSON.stringify(key)),
        ': ',
        span('tok-str', JSON.stringify(value)),
        i < entries.length - 1 ? ',\n' : '\n'
      );
    });
    json.append('}');
  };

  const renderArticle = (article) => {
    const image = safeUrl(article.urlImage);
    media.replaceChildren();
    media.hidden = !image;
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = '';
      img.loading = 'lazy';
      img.width = 640;
      img.height = 360;
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        media.hidden = true;
      };
      media.append(img);
    }
    meta.textContent = [article.source, formatDate(article.publishDate)]
      .filter(Boolean)
      .join(' · ');
    title.textContent = article.title ?? 'Untitled';
    desc.textContent = article.description ?? '';
    desc.hidden = !article.description;
    const href = safeUrl(article.url);
    link.hidden = !href;
    if (href) {
      link.href = href;
      link.rel = 'noopener noreferrer';
    }
    announce(`Loaded: ${title.textContent}`);
  };

  const renderError = (message) => {
    media.hidden = desc.hidden = link.hidden = true;
    meta.textContent = 'Error';
    title.textContent = message;
    announce(`Error: ${message}`);
  };

  const fetchArticle = async () => {
    send.disabled = true;
    send.textContent = 'Sending…';
    status.textContent = 'Waiting for the Lord…';
    const started = performance.now();
    try {
      const res = await fetch('/api', {
        headers: { accept: 'application/json' }
      });
      const ms = Math.round(performance.now() - started);
      const body = await res.json().catch(() => ({
        error: 'The response was not JSON. Please try again.'
      }));
      status.textContent = `${res.status} ${res.ok ? 'OK' : 'Error'} · ${ms} ms`;
      renderJson(body);
      if (body.error) renderError(body.error);
      else renderArticle(body);
    } catch {
      const error = 'Could not reach elonmu.sh. Please try again later.';
      status.textContent = 'No response';
      renderJson({ error });
      renderError(error);
    } finally {
      send.disabled = false;
      send.textContent = 'Send';
    }
  };

  send.hidden = false;
  send.addEventListener('click', fetchArticle);
})();

// Copy buttons stay hidden when the Clipboard API is missing.
if (navigator.clipboard) {
  for (const button of document.querySelectorAll('.copy')) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const code = button.closest('figure').querySelector('pre').textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Failed';
      }
      announce(button.textContent);
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 1500);
    });
  }
}

// The hero clips: the launch plays once, then the cruise loop fades in over
// its last frame. The toggle pauses whichever is playing, and both pause
// while the hero is off-screen.
(() => {
  const hero = document.querySelector('.hero');
  const launch = hero.querySelector('.hero__video--launch');
  const cruise = hero.querySelector('.hero__video--cruise');
  const toggle = hero.querySelector('.hero__toggle');

  // Reduced motion: the CSS shows a still, so stop the hidden launch and
  // drop its sources to end the download.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    launch.pause();
    launch.replaceChildren();
    launch.load();
    return;
  }

  let current = launch;
  let userPaused = false;
  let onScreen = true;

  const sync = () => {
    toggle.setAttribute('aria-pressed', String(userPaused));
  };

  const apply = () => {
    if (userPaused || !onScreen) {
      current.pause();
      return;
    }
    // A blocked autoplay (iOS Low Power Mode) leaves the toggle on play.
    current.play().catch(() => {
      userPaused = true;
      sync();
    });
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

  launch.addEventListener('ended', () => {
    current = cruise;
    cruise.addEventListener(
      'playing',
      () => hero.classList.add('is-cruising'),
      { once: true }
    );
    apply();
  });

  toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    sync();
    apply();
  });

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    apply();
  }).observe(hero);

  toggle.hidden = false;
})();

// Sections rise in once as they enter. Without this script, or with reduced
// motion, they are simply visible.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue;
        target.classList.add('is-in');
        observer.unobserve(target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' }
  );
  for (const target of document.querySelectorAll('[data-reveal]')) {
    target.classList.add('will-reveal');
    observer.observe(target);
  }
}
