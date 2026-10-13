import { Transform } from 'node:stream';
import { Prune } from './prune.js';
import { Options, normalizeOptions } from './options.js';
import { defaultServices } from './services.js';

export function prune(dest: string, options: Options = {}): Transform {
  return new Prune(dest, normalizeOptions(options), defaultServices);
}
