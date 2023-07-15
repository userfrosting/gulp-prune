import fs from 'node:fs';
import fancyLog from 'fancy-log';

export type Services = {
  fs: typeof fs,
  log: Console['log'],
};

export const defaultServices: Services = {
  fs,
  log: (...args) => void fancyLog(...args),
};
