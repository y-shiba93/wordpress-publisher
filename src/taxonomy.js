import fs from 'node:fs';
import path from 'node:path';
import { mergeTermOptions, readArticle, writeArticle } from './frontmatter.js';
import { RestClient } from './rest-client.js';
import { SshClient } from './ssh-client.js';
import { resolveConfigPath } from './config.js';

function clientFor(config) {
  return config.transport.type === 'ssh' ? new SshClient(config) : new RestClient(config);
}

export async function fetchTaxonomy(config) {
  const client = clientFor(config);
  const [categories, tags] = await Promise.all([
    client.fetchTerms('categories'),
    client.fetchTerms('tags'),
  ]);
  return { syncedAt: new Date().toISOString(), categories, tags };
}

export function writeTaxonomyCache(config, taxonomy) {
  const cachePath = resolveConfigPath(config, config.taxonomyCache);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(taxonomy, null, 2)}\n`, 'utf8');
  return cachePath;
}

export function applyTaxonomyToArticle(mdPath, taxonomy) {
  const article = readArticle(mdPath);
  article.frontmatter.categories = mergeTermOptions(taxonomy.categories, article.frontmatter.categories);
  article.frontmatter.tags = mergeTermOptions(taxonomy.tags, article.frontmatter.tags);
  writeArticle(mdPath, article.frontmatter, article.content);
}

export function articlePaths(config, slug) {
  const root = resolveConfigPath(config, config.contentDir);
  if (slug) return [path.join(root, slug, config.entryFile)];
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, config.entryFile))
    .filter((filePath) => fs.existsSync(filePath));
}
