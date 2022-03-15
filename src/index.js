import { promises as fs } from 'fs';
import * as path from 'path';
import { globby } from 'globby';
import PluginError from 'plugin-error';
import colors from 'ansi-colors';
import log from 'fancy-log';
import { Transform } from 'stream';
import File from 'vinyl';
import AggregateError from 'aggregate-error';

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function verify(condition, message) {
  if (!condition) {
    throw new PluginError('gulp-prune', message);
  }
}

/**
 * @param {string} file
 * @returns {string}
 */
function normalize(file) {
  if (process.platform === 'win32') {
    file = file.replace(/\\/g, '/');
  }
  return file;
}

/**
 * @typedef {(path: string) => boolean} FilterFunc
 */

/**
 * @param {FilterFunc} filter1
 * @param {FilterFunc} filter2
 * @returns {FilterFunc}
 */
function joinFilters(filter1, filter2) {
  return (name) => filter1(name) && filter2(name);
}

/**
 * @typedef {(srcFile: string) => string|string[]} MapFunc
 * @typedef {{
 *     map: MapFunc,
 *     pattern: string,
 *     filter?: () => boolean,
 *     ext?: string[],
 *     verbose: boolean,
 * }} StrictOptions
 */

class PruneTransform extends Transform {

  /**
   * @param {string} dest
   * @param {StrictOptions} options
   */
  constructor(dest, options) {
    super({ objectMode: true });

    /** @type {{ [x: string]: boolean }} */
    const keep = {};

    /**
     * @private
     */
    this._dest = path.resolve(dest);
    /**
     * @private
     */
    this._keep = keep;
    /**
     * @private
     * @type {MapFunc}
     */
    this._mapper = options.map;
    /**
     * @private
     * @type {(name: string) => boolean}
     */
    this._filter = (name) => !Object.hasOwnProperty.call(keep, name);
    /**
     * @private
     */
    this._pattern = options.pattern;

    if (options.filter !== undefined) {
      this._filter = joinFilters(this._filter, options.filter);
    }

    if (options.ext !== undefined) {
      const ext = options.ext;
      this._mapper = (name) => ext.map(e => name.replace(/(\.[^./\\]*)?$/, e));
      if (this._pattern === '**/*') {
        this._pattern = '**/*@(' + ext.join('|') + ')';
      } else {
        this._filter = joinFilters((name) => ext.some(e => name.endsWith(e)), this._filter);
      }
    }

    this._verbose = options.verbose;
  }

  /**
   * @param {unknown} file
   * @param {BufferEncoding} encoding
   * @param {import('stream').TransformCallback} callback
   */
  async _transform(file, encoding, callback) {
    // Only handle Vinyl chunks
    if (!File.isVinyl(file)) {
      this.push(file, encoding);
      callback();
      return;
    }

    const name = path.relative(file.base, file.path);
    const mapped = this._mapper(name);

    if (Array.isArray(mapped)) {
      for (const mappedPath of mapped) {
        this._keep[normalize(mappedPath)] = true;
      }
    } else {
      this._keep[normalize(mapped)] = true;
    }

    this.push(file, encoding);
    callback();
  }

  /**
   * @param {import('stream').TransformCallback} callback
   */
  async _flush(callback) {
    try {
      const candidates = await globby(this._pattern, { cwd: this._dest });
      const deleting = candidates.filter(this._filter);

      const results = await Promise.allSettled(deleting.map(f => {
        const file = path.join(this._dest, f);
        return this._remove(file);
      }))

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
      /** @type {any} */
      const error = e;
      callback(new PluginError('gulp-prune', error, { message: 'An error occurred' }));
      return;
    }

    callback();
  }

  /**
   * @param {string} file
   */
  async _remove(file) {
    const fileRelative = path.relative('.', file);

    try {
      await fs.unlink(file);
    } catch (e) {
      /** @type {any} */
      const error = e;
      if (this._verbose) {
        log('Prune:', colors.red(`${fileRelative}: ${error.message || error}`));
      }
      throw new Error(`${fileRelative}: ${error.message || error}`);
    }

    if (this._verbose) {
      log('Prune:', colors.yellow(fileRelative));
    }
  }
}

/**
 * @typedef {{
 *     map?: MapFunc,
 *     filter?: string|(() => boolean),
 *     ext?: string|string[],
 *     verbose?: boolean,
 * }} Options
 */

/**
 * @param {string} dest
 * @param {Options} options
 * @returns {Transform}
 */
export function prune(dest, options = {}) {
  /** @type {StrictOptions} */
  const strictOptions = {
    map: (name) => name,
    verbose: false,
    pattern: '**/*',
  };

  if (options.map !== undefined) {
    verify(options.ext === undefined, 'options.map and options.ext are incompatible');
    strictOptions.map = options.map;
  }

  if (options.filter !== undefined) {
    if (typeof options.filter === 'string') {
      strictOptions.pattern = options.filter;
    } else {
      strictOptions.filter = options.filter;
    }
  }

  if (options.ext !== undefined) {
    if (!Array.isArray(options.ext)) {
      options.ext = [ options.ext ];
    }
    strictOptions.ext = options.ext.slice();
  }

  if (options.verbose !== undefined) {
    strictOptions.verbose = options.verbose;
  }

  return new PruneTransform(dest, strictOptions);
}
