import { Readable, Transform } from 'stream';
import Vinyl from 'vinyl';
import PluginError from 'plugin-error';
import { Prune } from './prune.js';
import test from "ava";

test('creates a transform stream', t => {
  let pruneStream = new Prune('somewhere', {}, {});
  t.assert(pruneStream instanceof Transform);
});

async function runAndCheck(
  pruneDest: ConstructorParameters<typeof Prune>[0],
  pruneOptions: ConstructorParameters<typeof Prune>[1],
  files: Record<string, string>,
  expectDeleted: string[]
) {
  // TODO memfs for prune
  const testStream = Readable.from(
    // TODO I think this was only ./src
    Object.entries(files).map(([path, contents]) => new Vinyl({ path, contents: Buffer.from(contents) })),
    { objectMode: true }
  )
    .pipe(new Prune(pruneDest, pruneOptions, { fs, log }));

  const results: Vinyl[] = [];
  for await (const result of testStream) {
    results.push(result);
  }

  // TODO Assertions
  // expected outputs (stream and fs)
}

{
  const files = {
    '/a/b/outside': 'a file outside selected paths',
    '/a/b/src/both-root-and-dir': '',
    '/a/b/src/src-root-and-dir': '',
    '/a/b/src/both-root': '',
    '/a/b/src/src-root': '',
    '/a/b/src/dir/both-root-and-dir': '',
    '/a/b/src/dir/src-root-and-dir': '',
    '/a/b/src/dir/both-dir': '',
    '/a/b/src/dir/src-dir': '',
    '/a/b/src/constructor': 'Name of property on Object.  Unique to src.',
    '/a/b/src/toLocaleString': 'Name of property on Object.  Common to src and dest.',
    '/a/b/dest/both-root-and-dir': '',
    '/a/b/dest/dest-root-and-dir': '',
    '/a/b/dest/both-root': '',
    '/a/b/dest/dest-root': '',
    '/a/b/dest/dir/both-root-and-dir': '',
    '/a/b/dest/dir/dest-root-and-dir': '',
    '/a/b/dest/dir/both-dir': '',
    '/a/b/dest/dir/dest-dir': '',
    '/a/b/dest/toString': 'Name of property on Object.  Unique to dest.',
    '/a/b/dest/toLocaleString': 'Name of property on Object.  Common to src and dest.',
  };

  test('passes data through', async t => {
    await runAndCheck(
      // TODO relative dest
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      [],
    );
  });

  test('deletes expected files', async t => {
    const expectDeleted = [
      '/a/b/dest/dest-root-and-dir',
      '/a/b/dest/dest-root',
      '/a/b/dest/dir/dest-root-and-dir',
      '/a/b/dest/dir/dest-dir',
      '/a/b/dest/toString',
    ];

    await runAndCheck(
      // TODO relative dest
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });
}

{
  const files = {
    '/a/b/outside': 'a file outside selected paths',
    '/a/b/src/1': '',
    '/a/b/src/dir/2': '',
    '/a/b/dest/outside': '',
    '/a/b/dest/1': '',
    '/a/b/dest/mapped1': 'only with simple transform',
    '/a/b/dest/dest/1': 'only with directory transform',
    '/a/b/dest/dest/dir/2': 'only with directory transform',
    '/a/b/dest/dir/2': '',
    '/a/b/dest/dir/mapped2': 'only with simple transform',
  };

  test('options.map - applies simple function transform', async t => {
    const expectDeleted = [
      '/a/b/dest/outside',
      '/a/b/dest/1',
      '/a/b/dest/dest/1',
      '/a/b/dest/dir/2',
      '/a/b/dest/dest/dir/2',
    ];

    await runAndCheck(
      // TODO relative dest
      // { map: f => path.join(path.dirname(f), 'mapped' + path.basename(f)) }
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });

  test('options.map - applies function transform with directory', async t => {
    const expectDeleted = [
      '/a/b/dest/outside',
      '/a/b/dest/1',
      '/a/b/dest/mapped1',
      '/a/b/dest/dir/2',
      '/a/b/dest/dir/mapped2',
    ];

    await runAndCheck(
      // TODO relative dest
      // { map: f => path.join('dest', f) }
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });
}

{
  const files = {
    '/a/b/dest/aaa': '',
    '/a/b/dest/aab': '',
    '/a/b/dest/aba': '',
    '/a/b/dest/abb': '',
    '/a/b/dest/baa': '',
    '/a/b/dest/bab': '',
    '/a/b/dest/bba': '',
    '/a/b/dest/bbb': '',
    '/a/b/dest/123': '',
    '/a/b/dest/c/123': '',
  };

  test('options.filter - only deletes files that match a string pattern', async t => {
    const expectDeleted = [
      '/a/b/dest/aaa',
      '/a/b/dest/aab',
      '/a/b/dest/baa',
      '/a/b/dest/bab',
    ];

    await runAndCheck(
      // TODO relative dest
      // { filter: '?a?' }
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });

  test('options.filter - only deletes files that match a function predicate', async t => {
    const expectDeleted = [
      '/a/b/dest/aba',
      '/a/b/dest/abb',
      '/a/b/dest/bba',
      '/a/b/dest/bbb',
    ];

    await runAndCheck(
      // TODO relative dest
      // { filter: f => /.b.$/.test(f) }
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });

  test('options.filter - pattern matches relative to base directory', async t => {
    const expectDeleted = [
      '/a/b/dest/123',
    ];

    await runAndCheck(
      // TODO relative dest
      // { filter: '123' }
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });

  test('options.filter - propagates errors when filter throws', async t => {
    // TODO memfs for prune
    const testStream = Readable.from(
      // TODO I think this was only ./src
      Object.entries(files).map(([path, contents]) => new Vinyl({ path, contents: Buffer.from(contents) })),
      { objectMode: true }
    )
      // TODO relative dest
      // { filter: () => { throw new ExpectedError(); } }
      .pipe(new Prune('/a/b/dest', { map, pattern, verbose, ext, filter }, { fs, log }));

    // Run stream, catch error
  });
}

{
  const files = {
    '/a/b/src/1.old': '',
    '/a/b/src/2': '',
    '/a/b/src/4.old/four': '',
    '/a/b/dest/1.old': '',
    '/a/b/dest/1.old.new': '',
    '/a/b/dest/1.new': '',
    '/a/b/dest/1.new.map': '',
    '/a/b/dest/2': '',
    '/a/b/dest/2.new': '',
    '/a/b/dest/2.new.map': '',
    '/a/b/dest/3.new': '',
    '/a/b/dest/3.map': '',
    '/a/b/dest/4.new': '',
  };

  test('options.ext - adds or removes single extension', async t => {
    const expectDeleted = [
      '/a/b/dest/1.old.new',
      '/a/b/dest/3.new',
      '/a/b/dest/4.new',
    ];

    await runAndCheck(
      // TODO relative dest
      // { ext: '.new' }
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });

  test('options.ext - adds or removes multiple extensions', async t => {
    const expectDeleted = [
      'dest/1.old.new',
      'dest/3.new',
      'dest/4.new',
    ];

    await runAndCheck(
      // TODO relative dest
      // { ext: [ '.new', '.new.map' ] }
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });

  test('options.ext - can\'t be used with options.map', async t => {
    // TODO memfs for prune
    const testStream = Readable.from(
      // TODO I think this was only ./src
      Object.entries(files).map(([path, contents]) => new Vinyl({ path, contents: Buffer.from(contents) })),
      { objectMode: true }
    )
      // TODO relative dest
      // { map: f => f + '.js', ext: '.js' }
      .pipe(new Prune('/a/b/dest', { map, pattern, verbose, ext, filter }, { fs, log }));

    // run test stream, catch error
  });

  test('options.ext - works with options.filter pattern', async t => {
    const expectDeleted = [
      '/a/b/dest/3.new',
    ];

    await runAndCheck(
      // TODO relative dest
      // { ext: [ '.new', '.new.map' ], filter: '**/3.*' }
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });

  test('options.ext - works with options.filter function', async t => {
    const expectDeleted = [
      '/a/b/dest/3.new',
    ];

    await runAndCheck(
      // TODO relative dest
      // { ext: [ '.new', '.new.map' ], filter: (name) => /3/.test(name) }
      '/a/b/dest',
      { map, pattern, verbose, ext, filter },
      files,
      expectDeleted,
    );
  });
}
