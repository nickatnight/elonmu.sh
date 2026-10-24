export type Service = {
  id: string;
  name: string;
  nav: string;
  summary: string;
  href: string;
  cta: string;
};

export const SERVICES: readonly Service[] = [
  {
    id: 'news-api',
    name: 'News API',
    nav: 'News API',
    summary: 'One random news article about Elon Musk, as JSON.',
    href: '/#get-api',
    cta: 'GET /api/news'
  },
  {
    id: 'jet-tracker',
    name: 'Jet tracker',
    nav: 'Jet',
    summary:
      'Every private-jet flight this year, on a globe, with the fuel bill.',
    href: '/jet',
    cta: 'Open the globe'
  }
];
