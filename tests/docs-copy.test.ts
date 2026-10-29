import { describe, expect, it } from 'bun:test';
import { startCopy, startSend } from '../src/public/static/js/console.js';

type Child = { textContent: string; className?: string };

class FakeElement extends EventTarget {
  hidden = true;
  disabled = false;
  textContent = '';
  readonly dataset: Record<string, string | undefined> = {};
  readonly style = { minHeight: '' };
  height = 0;
  children: Child[] = [];
  figure: FakeElement | null = null;
  readonly parts: Record<string, FakeElement> = {};

  constructor(readonly ownerDocument: FakeDocument) {
    super();
  }

  closest(): FakeElement | null {
    return this.figure;
  }

  querySelector(selector: string): FakeElement | null {
    return this.parts[selector] ?? null;
  }

  getBoundingClientRect(): { height: number } {
    return { height: this.height };
  }

  replaceChildren(...nodes: Child[]): void {
    this.children = nodes;
    this.textContent = nodes.map((n) => n.textContent).join('');
  }
}

class FakeDocument {
  readonly announce: FakeElement = new FakeElement(this);

  createElement(): Child {
    return { textContent: '', className: '' };
  }

  createTextNode(text: string): Child {
    return { textContent: text };
  }

  querySelector(selector: string): FakeElement | null {
    return selector === '.announce' ? this.announce : null;
  }
}

const STATIC_EXAMPLE = '{\n  "source": "Business Insider"\n}';

const responseFigure = () => {
  const doc = new FakeDocument();
  const figure = new FakeElement(doc);
  const pre = new FakeElement(doc);
  const code = new FakeElement(doc);
  code.textContent = STATIC_EXAMPLE;
  pre.textContent = STATIC_EXAMPLE;
  pre.parts.code = code;
  const send = new FakeElement(doc);
  send.dataset.api = '/api/hype';
  const copy = new FakeElement(doc);
  for (const el of [send, copy]) el.figure = figure;
  figure.parts.pre = pre;
  figure.parts['.code__label'] = new FakeElement(doc);
  figure.parts['.code__full'] = new FakeElement(doc);
  return { doc, figure, pre, code, send, copy };
};

const fakeClipboard = () => {
  const written: string[] = [];
  return {
    written,
    writeText: async (text: string) => {
      written.push(text);
    }
  };
};

const respondWith =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });

const noLater = () => 0;

const days = Array.from({ length: 5 }, (_, i) => ({
  date: `2026-10-2${i}`,
  views: 1000 + i
}));

describe('Copy on /docs', () => {
  it('copies the static example before Send has run', async () => {
    const { copy } = responseFigure();
    const clipboard = fakeClipboard();
    const run = startCopy(copy, { clipboard, later: noLater });
    await run?.();
    expect(clipboard.written).toEqual([STATIC_EXAMPLE]);
  });

  it('copies the full live response, pretty-printed and untrimmed, after Send', async () => {
    const { code, send, copy } = responseFigure();
    const body = { article: 'Elon Musk', days };
    await startSend(send, { fetch: respondWith(body) })?.();
    expect(code.textContent).toContain('… 2 more');
    const clipboard = fakeClipboard();
    await startCopy(copy, { clipboard, later: noLater })?.();
    expect(clipboard.written).toEqual([JSON.stringify(body, null, 2)]);
  });

  it('copies an error body from Send as it came back', async () => {
    const { send, copy } = responseFigure();
    const body = { error: 'Pageview data is unavailable right now.' };
    await startSend(send, { fetch: respondWith(body) })?.();
    const clipboard = fakeClipboard();
    await startCopy(copy, { clipboard, later: noLater })?.();
    expect(clipboard.written).toEqual([JSON.stringify(body, null, 2)]);
  });

  it('says Copied, announces it, and resets the label later', async () => {
    const { doc, copy } = responseFigure();
    let reset: (() => void) | null = null;
    const later = (fn: () => void) => {
      reset = fn;
      return 0;
    };
    await startCopy(copy, { clipboard: fakeClipboard(), later })?.();
    expect(copy.textContent).toBe('Copied');
    expect(doc.announce.textContent).toBe('Copied');
    (reset as unknown as () => void)();
    expect(copy.textContent).toBe('Copy');
  });

  it('says Failed when the clipboard refuses', async () => {
    const { copy } = responseFigure();
    const clipboard = {
      writeText: async () => {
        throw new Error('denied');
      }
    };
    await startCopy(copy, { clipboard, later: noLater })?.();
    expect(copy.textContent).toBe('Failed');
  });

  it('shows the Copy button once wired', () => {
    const { copy } = responseFigure();
    startCopy(copy, { clipboard: fakeClipboard(), later: noLater });
    expect(copy.hidden).toBe(false);
  });
});

describe('Send on /docs', () => {
  it('calls the endpoint named on the button, once it is shown', async () => {
    const { send } = responseFigure();
    const urls: string[] = [];
    const fetch = async (url: string) => {
      urls.push(url);
      return new Response('{}');
    };
    const run = startSend(send, { fetch });
    expect(send.hidden).toBe(false);
    await run?.();
    expect(urls).toEqual(['/api/hype']);
  });

  it('shows the trimmed live response as a preview, with the full-response link', async () => {
    const { doc, figure, code, send } = responseFigure();
    await startSend(send, { fetch: respondWith({ days }) })?.();
    expect(code.textContent).toContain('… 2 more');
    expect(figure.parts['.code__label']?.textContent).toBe(
      'Preview · 200 OK · live'
    );
    expect(figure.parts['.code__full']?.hidden).toBe(false);
    expect(doc.announce.textContent).toBe('Loaded: Preview · 200 OK · live');
    expect(send.textContent).toBe('Send');
    expect(send.disabled).toBe(false);
  });

  it('says No response when the request fails', async () => {
    const { figure, code, send } = responseFigure();
    const fetch = async () => {
      throw new TypeError('offline');
    };
    await startSend(send, { fetch })?.();
    expect(figure.parts['.code__label']?.textContent).toBe(
      'Preview · No response'
    );
    expect(code.textContent).toContain('Could not reach elonmu.sh');
  });

  it('keeps the response box as tall as the example when an error comes back', async () => {
    const { pre, send } = responseFigure();
    pre.height = 844;
    const body = { error: 'Price data is unavailable right now.' };
    await startSend(send, { fetch: respondWith(body) })?.();
    expect(pre.style.minHeight).toBe('844px');
  });

  it('never lowers the response box height over several Sends', async () => {
    const { pre, send } = responseFigure();
    const body = { error: 'Price data is unavailable right now.' };
    const run = startSend(send, { fetch: respondWith(body) });
    pre.height = 844;
    await run?.();
    pre.height = 244;
    await run?.();
    expect(pre.style.minHeight).toBe('844px');
    pre.height = 900;
    await run?.();
    expect(pre.style.minHeight).toBe('900px');
  });
});
