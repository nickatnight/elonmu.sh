import * as querystring from 'querystring';
import axios from 'axios';

const NEWS_API_URL = 'https://newsapi.org/v2/everything';
const LANG = 'en';

export async function fetchNewsArticle() {
  const data = {
    q: 'elon musk',
    language: LANG,
    apiKey: process.env.NEWS_API_KEY
  };
  const url = `${NEWS_API_URL}?${querystring.stringify(data)}`;
  const axiosGet = await axios.get(url);
  // free api version limits to only fetching first page of results,
  // so randomize the returned article (default page size 100)
  const randomArticle = axiosGet.data.articles[Math.floor(Math.random() * 100)];

  return randomArticle;
}
