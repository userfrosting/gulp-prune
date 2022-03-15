import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import * as domain from 'domain';
import { Transform } from 'stream';
import mockFs, { restore } from 'mock-fs';
import { globbySync } from 'globby';
import File from 'vinyl';
import PluginError from 'plugin-error';
import { prune } from './index.js';

class ExpectedError extends Error {
}

class TestFile extends File {
  constructor(base, file) {
    super({
      cwd: process.cwd(),
      base: path.resolve(base),
      contents: fs.readFileSync(file),
      path: path.resolve(file),
      stat: fs.statSync(file)
    });
  }
}

function find(pattern) {
  return globbySync(pattern);
}

function testStream(done, stream, expectedDeleted) {
  const d = domain.create();
  d.on('error', error => {
    done(error);
  });
  d.run(() => {
    const original = find('**/*');
    assert.ok(expectedDeleted.every(f => original.indexOf(f) != -1));
    const expectedResult = original.filter(f => expectedDeleted.indexOf(f) == -1);

    find('src/**/*').forEach(f => stream.write(new TestFile('src', f)));

    stream.on('data', file => {
      // Empty callback required to pump files
    });

    stream.on('end', d.bind(() => {
      const result = find('**/*');
      assert.deepStrictEqual(result, expectedResult);

      done();
    }));

    stream.end();
  });
}

describe('prune()', function() {

  it('creates a transform stream', function() {
    let stream = prune('somewhere');
    assert.ok(stream instanceof Transform);
  });

  describe('returns Transform stream', function() {

    beforeEach(() => {
      mockFs({
        'outside': 'a file outside selected paths',
        'src/both-root-and-dir': '',
        'src/src-root-and-dir': '',
        'src/both-root': '',
        'src/src-root': '',
        'src/dir/both-root-and-dir': '',
        'src/dir/src-root-and-dir': '',
        'src/dir/both-dir': '',
        'src/dir/src-dir': '',
        'src/constructor': 'Name of property on Object.  Unique to src.',
        'src/toLocaleString': 'Name of property on Object.  Common to src and dest.',
        'dest/both-root-and-dir': '',
        'dest/dest-root-and-dir': '',
        'dest/both-root': '',
        'dest/dest-root': '',
        'dest/dir/both-root-and-dir': '',
        'dest/dir/dest-root-and-dir': '',
        'dest/dir/both-dir': '',
        'dest/dir/dest-dir': '',
        'dest/toString': 'Name of property on Object.  Unique to dest.',
        'dest/toLocaleString': 'Name of property on Object.  Common to src and dest.',
      });
    });
    afterEach(() => {
      restore();
    });

    it('passes data through', function(done) {
      const d = domain.create();
      d.on('error', error => {
        done(error);
      });
      d.run(() => {
        const stream = prune('dest');
        const files = find('src/**/*').map(f => new TestFile('src', f));

        let count = 0;
        stream.on('data', file => {
          assert.strictEqual(file, files[count]);
          ++count;
        });

        files.forEach(f => stream.write(f));

        stream.on('end', () => {
          assert.strictEqual(count, files.length);
          done();
        });

        stream.end();
      });
    });

    it('deletes expected files', function(done) {
      testStream(done, prune('dest'), [
        'dest/dest-root-and-dir',
        'dest/dest-root',
        'dest/dir/dest-root-and-dir',
        'dest/dir/dest-dir',
        'dest/toString',
      ]);
    });
  });

  describe('options.map', function() {

    beforeEach(() => {
      mockFs({
        'outside': 'a file outside selected paths',
        'src/1': '',
        'src/dir/2': '',
        'dest/outside': '',
        'dest/1': '',
        'dest/mapped1': 'only with simple transform',
        'dest/dest/1': 'only with directory transform',
        'dest/dest/dir/2': 'only with directory transform',
        'dest/dir/2': '',
        'dest/dir/mapped2': 'only with simple transform',
      });
    });
    afterEach(() => {
      restore();
    });

    it('applies simple function transform', function(done) {
      testStream(
        done,
        prune(
          'dest',
          { map: f => path.join(path.dirname(f), 'mapped' + path.basename(f)) },
        ),
        [
          'dest/outside',
          'dest/1',
          'dest/dest/1',
          'dest/dir/2',
          'dest/dest/dir/2',
        ],
      );
    });

    it('applies function transform with directory', function(done) {
      testStream(
        done,
        prune('dest', { map: f => path.join('dest', f) }),
        [
          'dest/outside',
          'dest/1',
          'dest/mapped1',
          'dest/dir/2',
          'dest/dir/mapped2',
        ],
      );
    });

  });

  describe('options.filter', function() {

    beforeEach(() => {
      mockFs({
        'dest/aaa': '',
        'dest/aab': '',
        'dest/aba': '',
        'dest/abb': '',
        'dest/baa': '',
        'dest/bab': '',
        'dest/bba': '',
        'dest/bbb': '',
        'dest/123': '',
        'dest/c/123': '',
      });
    });
    afterEach(() => {
      restore();
    });

    it('only deletes files that match a string pattern', function(done) {
      testStream(done, prune('dest', { filter: '?a?' }), [
        'dest/aaa',
        'dest/aab',
        'dest/baa',
        'dest/bab',
      ]);
    });

    it('only deletes files that match a function predicate', function(done) {
      testStream(done, prune('dest', { filter: f => /.b.$/.test(f) }), [
        'dest/aba',
        'dest/abb',
        'dest/bba',
        'dest/bbb',
      ]);
    });

    it("pattern matches relative to base directory", function(done) {
      testStream(done, prune('dest', { filter: '123' }), [
        'dest/123',
      ]);
    });

    it('propagates errors when filter throws', function(done) {
        const d = domain.create();
        d.on('error', error => {
          done(error);
        });
        d.run(() => {
          const stream = prune(
            'dest',
            { filter: () => { throw new ExpectedError(); } },
          );

          stream.on('data', () => {
            // Empty callback required to pump files
          });

          stream.on('end', d.bind(() => {
            assert.fail('Did not see ExpectedError');
          }));

          stream.on('error', file => {
            done();
          });

          stream.end();
        });
    });
  });

  describe('options.ext', function() {

    beforeEach(() => {
      mockFs({
        'src/1.old': '',
        'src/2': '',
        'src/4.old/four': '',
        'dest/1.old': '',
        'dest/1.old.new': '',
        'dest/1.new': '',
        'dest/1.new.map': '',
        'dest/2': '',
        'dest/2.new': '',
        'dest/2.new.map': '',
        'dest/3.new': '',
        'dest/3.map': '',
        'dest/4.new': '',
      });
    });
    afterEach(() => {
      restore();
    });

    it('adds or removes single extension', function(done) {
      testStream(done, prune('dest', { ext: '.new' }), [
        'dest/1.old.new',
        'dest/3.new',
        'dest/4.new',
      ]);
    });

    it('adds or removes multiple extensions', function(done) {
      testStream(done, prune('dest', { ext: [ '.new', '.new.map' ] }), [
        'dest/1.old.new',
        'dest/3.new',
        'dest/4.new',
      ]);
    });

    it("can't be used with options.map", function() {
      assert.throws(() => {
        prune('dest', { map: f => f + '.js', ext: '.js' });
      }, PluginError);
    });

    it('works with options.filter pattern', function(done) {
      testStream(done, prune('dest', { ext: [ '.new', '.new.map' ], filter: '**/3.*' }), [
        'dest/3.new',
      ]);
    });

    it('works with options.filter function', function(done) {
      testStream(done, prune('dest', { ext: [ '.new', '.new.map' ], filter: (name) => /3/.test(name) }), [
        'dest/3.new',
      ]);
    });
  });
});
