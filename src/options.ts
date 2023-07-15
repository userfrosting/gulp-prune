import PluginError from 'plugin-error';
import { FilterFn, MapFn, StrictOptions } from './prune.js';

export type Options = {
  map?: MapFn,
  filter?: string | FilterFn,
  ext?: string | string[],
  verbose?: boolean,
};

function verify(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new PluginError('gulp-prune', message);
  }
}

export function normalizeOptions(options: Options = {}): StrictOptions {
  const strictOptions: StrictOptions = {
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
      options.ext = [options.ext];
    }
    strictOptions.ext = options.ext.slice();
  }

  if (options.verbose !== undefined) {
    strictOptions.verbose = options.verbose;
  }

  return strictOptions;
}
