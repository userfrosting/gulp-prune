import { Prune } from './prune.js';
import { Transform } from 'stream';
import { Options, normalizeOptions } from './options.js';
import { defaultServices } from './services.js';

export function prune(dest: string, options: Options = {}): Transform {
  return new Prune(dest, normalizeOptions(options), defaultServices);
}
