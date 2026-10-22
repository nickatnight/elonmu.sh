import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { AxiosError, type AxiosResponse } from 'axios';
import { newsApiArticle } from './fixtures';
import { startTestServer, type TestServer } from './helpers';

let fetchNewsArticle: () => Promise<unknown>;

mock.module('../src/services/news.service', () => ({
  fetchNewsArticle: () => fetchNewsArticle()
}));

// Imported after mock.module so the route picks up the mocked service.
const { createApp } = await import('../src/app');

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(createApp());
});

afterAll(() => server.close());

const getApi = async () => {
  const res = await fetch(`${server.url}/api`);
  return { status: res.status, body: await res.json() };
};

describe('GET /api', () => {
  it('maps a NewsAPI article to the public shape', async () => {
    fetchNewsArticle = async () => newsApiArticle;

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

  it('returns 502 when NewsAPI responds with an error', async () => {
    fetchNewsArticle = async () => {
      throw new AxiosError('401', 'ERR_BAD_REQUEST', undefined, {}, {
        status: 401
      } as AxiosResponse);
    };

    expect(await getApi()).toEqual({
      status: 502,
      body: {
        error: 'There was an error with NewsAPI. Please try again later.'
      }
    });
  });

  it('returns 502 when NewsAPI never responds', async () => {
    fetchNewsArticle = async () => {
      throw new AxiosError('timeout', 'ECONNABORTED', undefined, {});
    };

    expect(await getApi()).toEqual({
      status: 502,
      body: {
        error: 'There was an error with request. Please try again later.'
      }
    });
  });

  it('returns 500 when the request could not be made', async () => {
    fetchNewsArticle = async () => {
      throw new AxiosError('bad config');
    };

    expect(await getApi()).toEqual({
      status: 500,
      body: { error: 'Something broke. Please try again later.' }
    });
  });

  it('returns 500 for non-Axios errors', async () => {
    fetchNewsArticle = async () => undefined;

    expect(await getApi()).toEqual({
      status: 500,
      body: { error: 'An unknown error occurred. Please try again later.' }
    });
  });
});
