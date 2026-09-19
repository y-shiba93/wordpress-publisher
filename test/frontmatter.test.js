import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkedTermIds, mergeTermOptions, readArticle, writeArticle } from '../src/frontmatter.js';
import { parseImageReferences } from '../src/utils.js';

test('taxonomy options preserve checked values by id and slug', () => {
  const remote = [{ id: 1, name: 'A', slug: 'a' }, { id: 2, name: 'B', slug: 'b' }];
  const merged = mergeTermOptions(remote, [{ id: 9, name: 'old', slug: 'b', checked: true }]);
  assert.deepEqual(checkedTermIds(merged), [2]);
});

test('frontmatter round trip keeps the article body', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-publisher-test-'));
  const file = path.join(dir, 'index.md');
  writeArticle(file, { title: '記事', slug: 'article', tags: [] }, '\n本文\n');
  const article = readArticle(file);
  assert.equal(article.frontmatter.slug, 'article');
  assert.match(article.content, /本文/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('local Markdown and HTML images are detected', () => {
  assert.deepEqual(
    parseImageReferences('![a](images/a.png)\n<img src="images/b.jpg">\n![x](https://example.com/x.png)'),
    ['images/a.png', 'images/b.jpg'],
  );
});
