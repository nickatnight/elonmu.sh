import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  mock,
  spyOn
} from 'bun:test';
import axios from 'axios';
import { createApp } from '../src/app';
import { startTestServer, type TestServer } from './helpers';
import { sampleJet } from './jet/fakes';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(createApp({ jet: sampleJet() }));
});

afterEach(() => mock.restore());

afterAll(() => server.close());

describe('GET /healthz', () => {
  it('returns 200 ok without calling NewsAPI', async () => {
    const get = spyOn(axios, 'get');

    const res = await fetch(`${server.url}/healthz`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(get).not.toHaveBeenCalled();
  });
});
