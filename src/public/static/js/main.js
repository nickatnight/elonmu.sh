// elonmu.sh: the hero console's live request, and section entrances.
(() => {
  const consoleEl = document.querySelector('.console');
  if (!consoleEl) return;

  const $ = (selector) => consoleEl.querySelector(selector);
  const send = $('.console__send');
  const status = $('.console__status');
  const announce = $('.console__announce');
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
      return url.protocol === 'https:' || url.protocol === 'http:'
        ? url.href
        : null;
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
      img.width = 640;
      img.height = 360;
      img.loading = 'lazy';
      img.decoding = 'async';
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
    announce.textContent = `Loaded: ${title.textContent}`;
  };

  const renderError = (message) => {
    media.hidden = true;
    meta.textContent = 'Error';
    title.textContent = message;
    desc.hidden = true;
    link.hidden = true;
    announce.textContent = `Error: ${message}`;
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
        error: 'The response was not JSON.'
      }));
      status.textContent = `${res.status} ${res.ok ? 'OK' : 'Error'} · ${ms} ms`;
      renderJson(body);
      if (body.error) renderError(body.error);
      else renderArticle(body);
    } catch {
      status.textContent = 'No response';
      renderJson({ error: 'Could not reach elonmu.sh.' });
      renderError('Could not reach elonmu.sh. Please try again later.');
    } finally {
      send.disabled = false;
      send.textContent = 'Send';
    }
  };

  send.hidden = false;
  send.addEventListener('click', fetchArticle);
})();

// Sections below the fold rise in once as they enter. Without this script
// (or with reduced motion) they are simply visible.
(() => {
  const targets = document.querySelectorAll('[data-reveal]');
  if (
    !targets.length ||
    !('IntersectionObserver' in window) ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' }
  );
  for (const target of targets) {
    target.classList.add('will-reveal');
    observer.observe(target);
  }
})();
