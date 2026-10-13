import { globby } from 'globby';
import * as path from 'node:path';
import PluginError from 'plugin-error';
import { Transform, TransformCallback } from 'node:stream';
import Vinyl from 'vinyl';
import colors from 'ansi-colors';
import type { Services } from './services.js';

export type MapFn = (srcFile: string) => string | string[];
export type FilterFn = (name: string) => boolean;

export type StrictOptions = {
  map: MapFn,
  pattern: string,
  filter?: FilterFn,
  ext?: string[],
  verbose: boolean,
};

function joinFilters(filter1: FilterFn, filter2: FilterFn): FilterFn {
  return (name) => filter1(name) && filter2(name);
}

function normalize(file: string): string {
  if (process.platform === 'win32') {
    file = file.replace(/\\/g, '/');
  }
  return file;
}

async function remove(file: string, verbose: boolean, services: Services): Promise<void> {
  const { fs, log } = services;
  const fileRelative = path.relative('.', file);

  try {
    await fs.promises.unlink(file);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (verbose) {
      log('Prune:', colors.red(`${fileRelative}: ${error}`));
    }
    throw new Error(`${fileRelative}: ${error}`, { cause: e });
  }

  if (verbose) {
    log('Prune:', colors.yellow(fileRelative));
  }
}

export class Prune extends Transform {
  #dest: string;
  #keep = new Set<string>();
  #mapper: MapFn;
  #filter: FilterFn;
  #pattern: string;
  #verbose: boolean;
  #services: Services;

  constructor(dest: string, options: StrictOptions, services: Services) {
    super({ objectMode: true });
    // TODO affected by cwd
    this.#dest = path.resolve(dest);
    this.#mapper = options.map;
    this.#filter = name => !this.#keep.has(name);
    this.#pattern = options.pattern;

    if (options.filter !== undefined) {
      this.#filter = joinFilters(this.#filter, options.filter);
    }

    if (options.ext !== undefined) {
      const ext = options.ext;
      this.#mapper = name => ext.map(e => name.replace(/(\.[^./\\]*)?$/, e));
      if (this.#pattern === '**/*') {
        this.#pattern = '**/*@(' + ext.join('|') + ')';
      } else {
        this.#filter = joinFilters(name => ext.some(e => name.endsWith(e)), this.#filter);
      }
    }

    this.#verbose = options.verbose;
    this.#services = services;
  }

  public override _transform(chunk: unknown, encoding: BufferEncoding, callback: TransformCallback): void {
    if (!Vinyl.isVinyl(chunk)) {
      this.push(chunk, encoding);
      callback();
      return;
    }

    try {
      const name = path.relative(chunk.base, chunk.path);
      const mapped = this.#mapper(name);

      if (Array.isArray(mapped)) {
        for (const mappedPath of mapped) {
          this.#keep.add(normalize(mappedPath));
        }
      } else {
        this.#keep.add(normalize(mapped));
      }

      this.push(chunk, encoding);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  public override async _flush(callback: TransformCallback): Promise<void> {
    try {
      const candidates = await globby(this.#pattern, { cwd: this.#dest, fs: this.#services.fs });
      const deleting = candidates.filter(this.#filter);

      const results = await Promise.allSettled(deleting.map(f => {
        const file = path.join(this.#dest, f);
        return remove(file, this.#verbose, this.#services);
      }));

      const errors: unknown[] = [];
      for (const result of results) {
        if (result.status === 'rejected') {
          errors.push(result.reason);
        }
      }

      if (errors.length > 0) {
        throw new AggregateError(errors);
      }

    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      callback(new PluginError('gulp-prune', error, { message: 'An error occurred' }));
      return;
    }

    callback();
  }
}
