import { afterAll, afterEach } from 'bun:test';
import net from 'node:net';

export type BlockedAttempt = { api: string; host: string };

const attempts: BlockedAttempt[] = [];

export const takeBlockedAttempts = (): BlockedAttempt[] => attempts.splice(0);

const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|::1|\[::1\])$/i;

export const isLoopback = (host: string): boolean => LOOPBACK.test(host);

const refuseOutside = (api: string, host: string): void => {
  if (host === '' || isLoopback(host)) return;

  attempts.push({ api, host });
  throw new Error(`network guard: ${api} to ${host} is blocked in tests`);
};

const urlHost = (input: string | URL | Request): string => {
  const url = input instanceof Request ? input.url : String(input);

  return URL.canParse(url) ? new URL(url).hostname : '';
};

const guardFetch = (real: typeof fetch): typeof fetch =>
  Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      refuseOutside('fetch', urlHost(input));

      return real(input, init);
    },
    {
      preconnect: (url: string | URL) => {
        refuseOutside('fetch.preconnect', urlHost(url));
        real.preconnect(url);
      }
    }
  );

// Node's net.connect, tls.connect and http.request (axios's adapter) all end
// in Socket#connect; the first argument is either the user's options or the
// [options, callback] pair Node normalises them into.
const socketHost = (args: unknown[]): string => {
  const [first, second] = Array.isArray(args[0]) ? args[0] : args;

  if (typeof first === 'object' && first !== null) {
    return 'host' in first && typeof first.host === 'string'
      ? first.host
      : 'localhost';
  }

  return typeof second === 'string' ? second : 'localhost';
};

const realSocketConnect = net.Socket.prototype.connect;

Object.assign(net.Socket.prototype, {
  connect(this: net.Socket, ...args: unknown[]) {
    refuseOutside('net.Socket#connect', socketHost(args));

    return Reflect.apply(realSocketConnect, this, args);
  }
});

// Bun.fetch is a separate, read-only binding, so it cannot be guarded here.
globalThis.fetch = guardFetch(globalThis.fetch);

const RealWebSocket = globalThis.WebSocket;

globalThis.WebSocket = class WebSocket extends RealWebSocket {
  constructor(...args: ConstructorParameters<typeof RealWebSocket>) {
    refuseOutside('WebSocket', urlHost(args[0]));
    super(...args);
  }
};

const realBunConnect = Bun.connect;

Object.assign(Bun, {
  connect: async (
    options: Bun.TCPSocketConnectOptions | Bun.UnixSocketOptions
  ) => {
    if ('unix' in options) return realBunConnect(options);

    refuseOutside('Bun.connect', options.hostname);

    return realBunConnect(options);
  }
});

// node:dns (callback and promises, imported by name or as a namespace) calls
// the matching Bun.dns function at call time, so wrapping it here covers every
// form. Bun's types declare only lookup, so the rest are read untyped.
const DNS_QUERIES = [
  'lookup',
  'resolve',
  'resolveSrv',
  'resolveTxt',
  'resolveSoa',
  'resolveNaptr',
  'resolveMx',
  'resolveCaa',
  'resolveNs',
  'resolvePtr',
  'resolveCname',
  'resolveAny',
  'reverse',
  'lookupService'
];

for (const name of DNS_QUERIES) {
  const real: (...args: unknown[]) => unknown = Reflect.get(Bun.dns, name);

  Object.assign(Bun.dns, {
    [name]: async (host: string, ...rest: unknown[]) => {
      refuseOutside(`dns ${name}`, host);

      return real(host, ...rest);
    }
  });
}

const failIfLeaked = (culprit: string): void => {
  const leaked = takeBlockedAttempts();

  if (leaked.length === 0) return;

  const list = leaked.map(({ api, host }) => `${api} ${host}`).join(', ');

  throw new Error(
    `${culprit} tried to reach the network (${list}). Pass the module's fake to createApp.`
  );
};

afterEach(() => failIfLeaked('This test'));
// bun test never fires timers after the last test, but it does run
// setImmediate callbacks, after this hook unless the hook yields to them first.
afterAll(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  failIfLeaked('An afterAll hook or late callback');
});
