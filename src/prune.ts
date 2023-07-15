import { globby } from "globby";
import * as path from "path";
import PluginError from "plugin-error";
import { Transform, TransformCallback } from "stream";
import Vinyl from "vinyl";
import colors from 'ansi-colors';
import { Services } from "./services.js";

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

async function remove(file: string, verbose: boolean, services: Services) {
  const { fs, log } = services;
  // Used for presentation only
  const fileRelative = path.relative('.', file);

  try {
    await fs.promises.unlink(file);
  } catch (e) {
    const error = e as any;
    if (verbose) {
      log('Prune:', colors.red(`${fileRelative}: ${error.message || error}`));
    }
    throw new Error(`${fileRelative}: ${error.message || error}`);
  }

  if (verbose) {
    log('Prune:', colors.yellow(fileRelative));
  }
}

export class Prune extends Transform {
  #dest: string;
  #keep: Record<string, boolean> = {};
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
    this.#filter = name => !Object.hasOwnProperty.call(this.#keep, name);
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

  public override async _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): Promise<void> {
    // Only handle Vinyl chunks
    if (!Vinyl.isVinyl(chunk)) {
      this.push(chunk, encoding);
      callback();
      return;
    }

    const name = path.relative(chunk.base, chunk.path);
    const mapped = this.#mapper(name);

    if (Array.isArray(mapped)) {
      for (const mappedPath of mapped) {
        this.#keep[normalize(mappedPath)] = true;
      }
    } else {
      this.#keep[normalize(mapped)] = true;
    }

    this.push(chunk, encoding);
    callback();
  }

  public override async _flush(callback: TransformCallback): Promise<void> {
    try {
      // TODO globby has a bug in checkCwdOptions when using a custom fs
      // https://github.com/sindresorhus/globby/issues/236
      const candidates = await globby(this.#pattern, { cwd: this.#dest, fs: this.#services.fs });
      const deleting = candidates.filter(this.#filter);

      const results = await Promise.allSettled(deleting.map(f => {
        const file = path.join(this.#dest, f);
        return remove(file, this.#verbose, this.#services);
      }));

      /** @type {any[]} */
      const errors = [];
      for (const result of results) {
        if (result.status === 'rejected') {
          errors.push(result.reason);
        }
      }

      if (errors.length > 0) {
        throw new AggregateError(errors);
      }

    } catch (e) {
      const error = e as any;
      callback(new PluginError('gulp-prune', error, { message: 'An error occurred' }));
      return;
    }

    callback();
  }
}
