export type Service = {
  id: string;
  name: string;
  nav: string;
  summary: string;
  href: string;
  cta: string;
  api: string;
};

export const SERVICES: readonly Service[] = [
  {
    id: 'news-api',
    name: 'News roulette',
    nav: 'News',
    summary: 'One random news article about Elon Musk. Spin again for another.',
    href: '/news',
    cta: 'Spin the wheel',
    api: '/api/news'
  },
  {
    id: 'jet-tracker',
    name: 'Jet tracker',
    nav: 'Jet',
    summary:
      'Every private-jet flight this year, on a globe, with the fuel bill.',
    href: '/jet',
    cta: 'Open the globe',
    api: '/api/jet/flights'
  },
  {
    id: 'hype-meter',
    name: 'Hype meter',
    nav: 'Hype',
    summary:
      'A year of Wikipedia views for Elon Musk, read like a seismograph. Aftershocks included.',
    href: '/hype',
    cta: 'Read the tremors',
    api: '/api/hype'
  },
  {
    id: 'doge-since-snl',
    name: 'DOGE since SNL',
    nav: 'DOGE',
    summary: 'What your Dogecoin from the night he hosted SNL is worth today.',
    href: '/doge',
    cta: 'Check the damage',
    api: '/api/doge'
  }
];
