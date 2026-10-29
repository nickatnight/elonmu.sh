export type IsoTimestamp = string;

export type Article = {
  source: string;
  title: string;
  description: string | null;
  url: string;
  urlImage: string | null;
  publishDate: IsoTimestamp;
};
