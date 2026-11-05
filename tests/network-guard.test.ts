import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import dns from 'node:dns';
import { lookup, resolveMx } from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import axios from 'axios';
import express from 'express';
import { startTestServer, type TestServer } from './helpers';
import { isLoopback, takeBlockedAttempts } from './setup/network-guard';

const HOST = 'api.coingecko.com';

describe('the network guard', () => {
  it.each([
    ['fetch', 'fetch', () => fetch(`https://${HOST}/api/v3/ping`)],
    [
      'fetch with a URL',
      'fetch',
      () => fetch(new URL(`https://${HOST}/api/v3/ping`))
    ],
    [
      'fetch with a Request',
      'fetch',
      () => fetch(new Request(`https://${HOST}/api/v3/ping`))
    ],
    [
      'axios GET',
      'net.Socket#connect',
      () => axios.get(`https://${HOST}/api/v3/ping`, { timeout: 1000 })
    ],
    ['dns.promises.lookup', 'dns lookup', () => dns.promises.lookup(HOST)],
    ['a named dns/promises lookup', 'dns lookup', () => lookup(HOST)],
    ['a named dns/promises resolveMx', 'dns resolveMx', () => resolveMx(HOST)],
    [
      'Bun.connect',
      'Bun.connect',
      () =>
        Bun.connect({
          hostname: HOST,
          port: 443,
          socket: { data: () => undefined }
        })
    ]
  ] as const)(
    'rejects %s to an outside host and records it',
    async (_, api, call) => {
      await expect(call()).rejects.toThrow(HOST);
      expect(takeBlockedAttempts()).toEqual([{ api, host: HOST }]);
    }
  );

  it.each([
    [
      'net.connect',
      'net.Socket#connect',
      () => net.connect({ host: HOST, port: 80 })
    ],
    ['net.connect by port', 'net.Socket#connect', () => net.connect(80, HOST)],
    [
      'tls.connect',
      'net.Socket#connect',
      () => tls.connect({ host: HOST, port: 443 })
    ],
    [
      'fetch.preconnect',
      'fetch.preconnect',
      () => fetch.preconnect(`https://${HOST}`)
    ]
  ] as const)(
    'throws from %s to an outside host and records it',
    (_, api, call) => {
      expect(call).toThrow(HOST);
      expect(takeBlockedAttempts()).toEqual([{ api, host: HOST }]);
    }
  );

  it('blocks a callback dns.lookup and records it', async () => {
    const err = await new Promise((resolve) =>
      dns.lookup(HOST, (e) => resolve(e))
    );

    expect(String(err)).toContain(HOST);
    expect(takeBlockedAttempts()).toEqual([{ api: 'dns lookup', host: HOST }]);
  });

  const runFixture = async (name: string) => {
    const proc = Bun.spawn(
      ['bun', 'test', path.join(import.meta.dir, 'fixtures', name)],
      {
        cwd: path.join(import.meta.dir, '..'),
        stdout: 'ignore',
        stderr: 'pipe'
      }
    );
    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text()
    ]);

    return { exitCode, stderr };
  };

  it('fails the test even when the caller swallows the error', async () => {
    const { exitCode, stderr } = await runFixture('swallowed-leak.ts');

    expect(exitCode).toBe(1);
    expect(stderr).toContain(`fetch ${HOST}`);
    expect(stderr).toContain('(fail) answers "unavailable" when CoinGecko');
  });

  it('fails the run when an afterAll hook reaches the network', async () => {
    const { exitCode, stderr } = await runFixture('after-all-leak.ts');

    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      `An afterAll hook or late callback tried to reach the network (fetch ${HOST})`
    );
  });
});

describe('loopback', () => {
  let server: TestServer;

  beforeAll(async () => {
    const app = express();

    app.get('/ping', (_req, res) => {
      res.json({ pong: true });
    });
    server = await startTestServer(app);
  });

  afterAll(async () => {
    await server.close();
  });

  it('lets fetch reach a local test server', async () => {
    const res = await fetch(`${server.url}/ping`);

    expect(await res.json()).toEqual({ pong: true });
    expect(takeBlockedAttempts()).toEqual([]);
  });

  it('lets axios reach a local test server', async () => {
    const res = await axios.get(`${server.url}/ping`);

    expect(res.data).toEqual({ pong: true });
    expect(takeBlockedAttempts()).toEqual([]);
  });

  it('lets a dns lookup of localhost through', async () => {
    const { address } = await dns.promises.lookup('localhost');

    expect(isLoopback(address)).toBe(true);
    expect(takeBlockedAttempts()).toEqual([]);
  });

  it('lets Bun.connect reach a local test server', async () => {
    const socket = await Bun.connect({
      hostname: 'localhost',
      port: Number(new URL(server.url).port),
      socket: { data: () => undefined }
    });

    socket.end();
    expect(takeBlockedAttempts()).toEqual([]);
  });

  it('leaves a relative URL to fetch’s own error', async () => {
    await expect(fetch('/ping')).rejects.toThrow();
    expect(takeBlockedAttempts()).toEqual([]);
  });

  it.each([
    'localhost',
    'LOCALHOST',
    '127.0.0.1',
    '127.255.0.9',
    '::1',
    '[::1]'
  ])('treats %s as loopback', (host) => {
    expect(isLoopback(host)).toBe(true);
  });

  it.each([
    'api.coingecko.com',
    'localhost.example.com',
    '128.0.0.1',
    '10.0.0.1',
    '1.127.0.0.1'
  ])('treats %s as an outside host', (host) => {
    expect(isLoopback(host)).toBe(false);
  });
});
