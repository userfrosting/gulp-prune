import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import Vinyl from 'vinyl';
import { prune } from './index.js';
import { Options } from './options.js';

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  await Promise.all(Object.entries(files).map(async ([name, contents]) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
  }));
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string, relative = ''): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath, name);
      } else {
        files.push(name);
      }
    }
  }

  await visit(root);
  return files.sort();
}

async function withFixture(
  sourceFiles: Record<string, string>,
  destinationFiles: Record<string, string>,
  run: (source: string, destination: string) => Promise<void>,
): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gulp-prune-'));
  const source = path.join(root, 'src');
  const destination = path.join(root, 'dest');

  try {
    await fs.mkdir(source);
    await fs.mkdir(destination);
    await writeFiles(source, sourceFiles);
    await writeFiles(destination, destinationFiles);
    await run(source, destination);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function runPrune(
  source: string,
  destination: string,
  options: Options = {},
): Promise<{ input: Vinyl[]; output: unknown[] }> {
  const input = (await listFiles(source)).map(name => new Vinyl({
    cwd: path.dirname(source),
    base: source,
    path: path.join(source, name),
    contents: Buffer.from('source'),
  }));
  const stream = Readable.from(input, { objectMode: true }).pipe(prune(destination, options));
  const output: unknown[] = [];

  for await (const file of stream) {
    output.push(file);
  }

  return { input, output };
}

function assertOutputPassedThrough(input: Vinyl[], output: unknown[]): void {
  assert.equal(output.length, input.length);
  input.forEach((file, index) => assert.strictEqual(output[index], file));
}

describe('prune()', () => {
  it('creates a transform stream', async () => {
    const stream = prune('somewhere');
    assert.ok(stream instanceof Transform);
  });

  it('passes Vinyl files through and removes destination files without a source match', async () => {
    await withFixture(
      { 'root.txt': '', 'dir/source.txt': '' },
      { 'root.txt': '', 'stale.txt': '', 'dir/source.txt': '', 'dir/stale.txt': '' },
      async (source, destination) => {
        const { input, output } = await runPrune(source, destination);
        assertOutputPassedThrough(input, output);
        assert.deepEqual(await listFiles(destination), ['dir/source.txt', 'root.txt']);
      },
    );
  });

  it('passes non-Vinyl chunks through', async () => {
    await withFixture(
      {},
      { stale: '' },
      async (_source, destination) => {
        const output: unknown[] = [];
        for await (const chunk of Readable.from(['chunk'], { objectMode: true }).pipe(prune(destination))) {
          output.push(chunk);
        }
        assert.deepEqual(output, ['chunk']);
        assert.deepEqual(await listFiles(destination), []);
      },
    );
  });

  it('keeps mapped files from a simple map function', async () => {
    await withFixture(
      { '1': '', 'dir/2': '' },
      { '1': '', mapped1: '', 'dir/2': '', 'dir/mapped2': '', stale: '' },
      async (source, destination) => {
        await runPrune(source, destination, {
          map: name => path.join(path.dirname(name), `mapped${path.basename(name)}`),
        });
        assert.deepEqual(await listFiles(destination), ['dir/mapped2', 'mapped1']);
      },
    );
  });

  it('keeps files mapped beneath a destination subdirectory', async () => {
    await withFixture(
      { '1': '', 'dir/2': '' },
      { 'dest/1': '', 'dest/dir/2': '', '1': '', stale: '' },
      async (source, destination) => {
        await runPrune(source, destination, { map: name => path.join('dest', name) });
        assert.deepEqual(await listFiles(destination), ['dest/1', 'dest/dir/2']);
      },
    );
  });

  it('keeps all files returned by an array map function', async () => {
    await withFixture(
      { '1': '' },
      { '1.js': '', '1.css': '', stale: '' },
      async (source, destination) => {
        await runPrune(source, destination, { map: name => [`${name}.js`, `${name}.css`] });
        assert.deepEqual(await listFiles(destination), ['1.css', '1.js']);
      },
    );
  });

  it('uses a string filter as the destination glob', async () => {
    const names = ['aaa', 'aab', 'aba', 'abb', 'baa', 'bab', 'bba', 'bbb', '123'];
    await withFixture(
      {},
      Object.fromEntries(names.map(name => [name, ''])),
      async (source, destination) => {
        await runPrune(source, destination, { filter: '?a?' });
        assert.deepEqual(await listFiles(destination), ['123', 'aba', 'abb', 'bba', 'bbb']);
      },
    );
  });

  it('uses a filter function to select files for deletion', async () => {
    const names = ['aaa', 'aab', 'aba', 'abb', 'baa', 'bab', 'bba', 'bbb'];
    await withFixture(
      {},
      Object.fromEntries(names.map(name => [name, ''])),
      async (source, destination) => {
        await runPrune(source, destination, { filter: name => name.endsWith('ba') });
        assert.deepEqual(await listFiles(destination), ['aaa', 'aab', 'abb', 'baa', 'bab', 'bbb']);
      },
    );
  });

  it('propagates errors thrown by a filter function', async () => {
    await withFixture(
      {},
      { stale: '' },
      async (source, destination) => {
        await assert.rejects(
          runPrune(source, destination, { filter: () => { throw new Error('filter failed'); } }),
          error => {
            assert.ok(error instanceof Error);
            assert.equal((error as Error & { plugin?: string }).plugin, 'gulp-prune');
            assert.equal(error.message, 'An error occurred');
            assert.match(error.stack ?? '', /filter failed/);
            return true;
          },
        );
      },
    );
  });

  it('adds each configured extension when matching source files', async () => {
    await withFixture(
      { '1.old': '', '2': '' },
      {
        '1.old': '',
        '1.new': '',
        '1.new.map': '',
        '2.new': '',
        '2.new.map': '',
        '3.new': '',
        'stale': '',
      },
      async (source, destination) => {
        await runPrune(source, destination, { ext: ['.new', '.new.map'] });
        assert.deepEqual(
          await listFiles(destination),
          ['1.new', '1.new.map', '1.old', '2.new', '2.new.map', 'stale'],
        );
      },
    );
  });

  it('combines extensions with a filter function', async () => {
    await withFixture(
      { '1': '', '2': '' },
      { '1.new': '', '2.new': '', '3.new': '', '3.map': '' },
      async (source, destination) => {
        await runPrune(source, destination, {
          ext: '.new',
          filter: name => name.startsWith('3'),
        });
        assert.deepEqual(await listFiles(destination), ['1.new', '2.new', '3.map']);
      },
    );
  });

  it('does not delete files whose names overlap Object properties', async () => {
    await withFixture(
      Object.fromEntries([['constructor', ''], ['toLocaleString', ''], ['__proto__', '']]),
      Object.fromEntries([
        ['constructor', ''],
        ['toLocaleString', ''],
        ['__proto__', ''],
        ['toString', ''],
      ]),
      async (source, destination) => {
        await runPrune(source, destination);
        assert.deepEqual(await listFiles(destination), ['__proto__', 'constructor', 'toLocaleString']);
      },
    );
  });

  it('rejects incompatible map and extension options', async () => {
    assert.throws(
      () => prune('somewhere', { map: name => name, ext: '.js' }),
      /options\.map and options\.ext are incompatible/,
    );
  });
});
