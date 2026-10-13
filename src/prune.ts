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
  return name => filter1(name) && filter2(name);
}

function normalize(file: string): string {
  return process.platform === 'win32' ? file.replace(/\\/g, '/') : file;
}

async function remove(file: string, verbose: boolean, services: Services): Promise<void> {
  const { fs, log } = services;
  const fileRelative = path.relative('.', file);

  try {
    await fs.promises.unlink(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (verbose) {
      log('Prune:', colors.red(`${fileRelative}: ${message}`));
    }
    throw new Error(`${fileRelative}: ${message}`, { cause: error });
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
    this.#dest = path.resolve(dest);
    this.#mapper = options.map;
    this.#filter = name => !this.#keep.has(name);
    this.#pattern = options.pattern;

    if (options.filter !== undefined) {
      this.#filter = joinFilters(this.#filter, options.filter);
    }

    if (options.ext !== undefined) {
      const ext = options.ext;
      this.#mapper = name => ext.map(e => {
        const basename = path.basename(name);
        const extensionStart = basename.lastIndexOf('.');
        return extensionStart < 0
          ? name + e
          : name.slice(0, name.length - basename.length + extensionStart) + e;
      });
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
      const candidates = await globby(this.#pattern, { cwd: this.#dest });
      const deleting = candidates.filter(this.#filter);
      const results = await Promise.allSettled(deleting.map(file =>
        remove(path.join(this.#dest, file), this.#verbose, this.#services),
      ));
      const errors = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason);
      if (errors.length > 0) {
        throw new AggregateError(errors);
      }
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      callback(new PluginError('gulp-prune', cause, { message: 'An error occurred' }));
      return;
    }

    callback();
  }
}
