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
import axios, { AxiosError, type AxiosResponse } from 'axios';
import { createApp } from '../src/app';
import { newsApiArticle } from './fixtures';
import { startTestServer, type TestServer } from './helpers';
import { sampleJet } from './jet/fakes';

// NewsAPI is stubbed at axios.get rather than with mock.module: module mocks
// persist across bun test files and would leak into the service tests.
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(createApp({ jet: sampleJet() }));
});

afterEach(() => mock.restore());

afterAll(() => server.close());

const getApi = async () => {
  const res = await fetch(`${server.url}/api`);
  return { status: res.status, body: await res.json() };
};

describe('GET /api', () => {
  it('maps a NewsAPI article to the public shape', async () => {
    spyOn(axios, 'get').mockResolvedValue({
      data: { articles: [newsApiArticle] }
    });

    expect(await getApi()).toEqual({
      status: 200,
      body: {
        source: 'Business Insider',
        title: newsApiArticle.title,
        description: newsApiArticle.description,
        url: newsApiArticle.url,
        urlImage: newsApiArticle.urlToImage,
        publishDate: newsApiArticle.publishedAt
      }
    });
  });

  it('returns 200 with an error when NewsAPI responds with an error', async () => {
    spyOn(axios, 'get').mockRejectedValue(
      new AxiosError('401', 'ERR_BAD_REQUEST', undefined, {}, {
        status: 401
      } as AxiosResponse)
    );

    expect(await getApi()).toEqual({
      status: 200,
      body: {
        error: 'There was an error with NewsAPI. Please try again later.'
      }
    });
  });

  it('returns 200 with an error when NewsAPI never responds', async () => {
    spyOn(axios, 'get').mockRejectedValue(
      new AxiosError('timeout', 'ECONNABORTED', undefined, {})
    );

    expect(await getApi()).toEqual({
      status: 200,
      body: {
        error: 'There was an error with request. Please try again later.'
      }
    });
  });

  it('returns 500 when the request could not be made', async () => {
    spyOn(axios, 'get').mockRejectedValue(new AxiosError('bad config'));

    expect(await getApi()).toEqual({
      status: 500,
      body: { error: 'Something broke. Please try again later.' }
    });
  });

  it('returns 500 for non-Axios errors', async () => {
    spyOn(axios, 'get').mockResolvedValue({ data: { articles: [] } });

    expect(await getApi()).toEqual({
      status: 500,
      body: { error: 'An unknown error occurred. Please try again later.' }
    });
  });
});
