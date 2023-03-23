import * as express from 'express';
import { AxiosError } from 'axios';
import { fetchNewsArticle } from '../services/news.service';

export const register = (app: express.Application) => {
  app.get(`/api`, async (req: any, res) => {
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
      if (err instanceof AxiosError) {
        if (err.response) {
          // The client was given an error response (5xx, 4xx)
          errorMessage =
            'There was an error with NewsAPI. Please try again later.';
        } else if (err.request) {
          // The client never received a response, and the request was never left
          errorMessage =
            'There was an error with request. Please try again later.';
        } else {
          // Anything else
          errorMessage = 'Something broke. Please try again later.';
        }
      } else {
        errorMessage = 'An unknown error occurred. Please try again later.';
      }
      res.json({ error: errorMessage });
    }
  });
};
