import { AxiosError } from 'axios';
import type * as express from 'express';
import { fetchNewsArticle } from '../services/news.service';

export const register = (app: express.Application) => {
  app.get(`/api`, async (_req, res) => {
    try {
      const randomArticle = await fetchNewsArticle();
      const article = {
        source: randomArticle.source.name,
        title: randomArticle.title,
        description: randomArticle.description,
        url: randomArticle.url,
        urlImage: randomArticle.urlToImage,
        publishDate: randomArticle.publishedAt
      };
      res.json({ ...article });
    } catch (err: unknown) {
      let errorMessage = '';
      let status = 500;
      if (err instanceof AxiosError) {
        // NewsAPI failures return 200: this server is healthy, only the
        // upstream call failed. 500 is reserved for our own errors.
        if (err.response) {
          // The client was given an error response (5xx, 4xx)
          status = 200;
          errorMessage =
            'There was an error with NewsAPI. Please try again later.';
        } else if (err.request) {
          // The client never received a response, and the request was never left
          status = 200;
          errorMessage =
            'There was an error with request. Please try again later.';
        } else {
          // Anything else
          errorMessage = 'Something broke. Please try again later.';
        }
      } else {
        errorMessage = 'An unknown error occurred. Please try again later.';
      }
      res.status(status).json({ error: errorMessage });
    }
  });
};
