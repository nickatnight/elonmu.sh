// The only list of services. Each entry is one topbar link and one card in
// the home Services section, so shipping a service means adding an entry here.
export type Service = {
  id: string; // kebab-case, matches the capability-map module id
  name: string; // card title: "Jet tracker"
  nav: string; // short topbar label: "Jet"
  summary: string; // one sentence, plain text (rendered escaped)
  href: string; // same-origin path or fragment: "/jet", "/#get-api"
  cta: string; // card call to action: "Open the globe"
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
