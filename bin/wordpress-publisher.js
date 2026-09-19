#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  applyTaxonomyToArticle,
  articlePaths,
  fetchPost,
  fetchTaxonomy,
  loadConfig,
  mergeTermOptions,
  publishArticle,
  resolveConfigPath,
  writeArticle,
  writeTaxonomyCache,
} from '../src/index.js';
import { assertSlug, today } from '../src/utils.js';

function usage() {
  console.log(`Usage:
  wordpress-publisher new <slug> --title <title> [--config <path>]
  wordpress-publisher publish <slug> [--publish] [--config <path>]
  wordpress-publisher update <slug> [--publish] [--refresh-thumbnail] [--config <path>]
  wordpress-publisher sync-taxonomy [--article <slug> | --all] [--config <path>]
  wordpress-publisher pull --id <post-id> [--slug <slug>] [--force] [--config <path>]
  wordpress-publisher check [--config <path>]`);
}

function parse(argv) {
  const values = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) { values._.push(value); continue; }
    const key = value.slice(2);
    if (['publish', 'refresh-thumbnail', 'all', 'force'].includes(key)) values[key] = true;
    else values[key] = argv[++index];
  }
  return values;
}

function cachedTaxonomy(config) {
  const cachePath = resolveConfigPath(config, config.taxonomyCache);
  return fs.existsSync(cachePath)
    ? JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    : { categories: [], tags: [] };
}

async function main() {
  const args = parse(process.argv.slice(2));
  const command = args._[0];
  if (!command || ['help', '-h'].includes(command)) { usage(); return; }
  const config = await loadConfig(args.config);

  if (command === 'new') {
    const slug = args._[1];
    assertSlug(slug);
    if (!args.title) throw new Error('--title is required');
    const mdPath = path.join(resolveConfigPath(config, config.contentDir), slug, config.entryFile);
    if (fs.existsSync(mdPath)) throw new Error(`Article already exists: ${mdPath}`);
    const taxonomy = cachedTaxonomy(config);
    writeArticle(mdPath, {
      title: args.title,
      slug,
      description: '',
      status: 'draft',
      created_at: today(),
      updated_at: today(),
      categories: mergeTermOptions(taxonomy.categories),
      tags: mergeTermOptions(taxonomy.tags),
      wp_post_id: null,
      wp_post_url: null,
      wp_media_id: null,
      thumbnail: null,
      last_uploaded_at: null,
    }, '\n');
    console.log(`Created: ${mdPath}`);
    return;
  }

  if (command === 'publish' || command === 'update') {
    const slug = args._[1];
    if (!slug) throw new Error('slug is required');
    const result = await publishArticle(config, slug, {
      mode: command === 'publish' ? 'create' : 'update',
      publish: args.publish === true,
      refreshThumbnail: args['refresh-thumbnail'] === true,
    });
    console.log(`${command === 'publish' ? 'Created' : 'Updated'}: ${result.result.link} (${result.result.status})`);
    return;
  }

  if (command === 'sync-taxonomy') {
    const taxonomy = await fetchTaxonomy(config);
    const cachePath = writeTaxonomyCache(config, taxonomy);
    const paths = args.article ? articlePaths(config, args.article) : (args.all ? articlePaths(config) : []);
    for (const mdPath of paths) {
      if (!fs.existsSync(mdPath)) throw new Error(`Article not found: ${mdPath}`);
      applyTaxonomyToArticle(mdPath, taxonomy);
    }
    console.log(`Synced ${taxonomy.categories.length} categories and ${taxonomy.tags.length} tags: ${cachePath}`);
    if (paths.length) console.log(`Updated ${paths.length} article frontmatter file(s)`);
    return;
  }

  if (command === 'pull') {
    const postId = Number(args.id);
    if (!Number.isInteger(postId) || postId <= 0) throw new Error('--id must be a positive integer');
    const endpoint = args.endpoint ?? config.postType;
    const post = await fetchPost(config, endpoint, postId);
    const slug = args.slug ?? post.slug;
    assertSlug(slug);
    const mdPath = path.join(resolveConfigPath(config, config.contentDir), slug, config.entryFile);
    if (fs.existsSync(mdPath) && !args.force) throw new Error(`Article exists; use --force to overwrite: ${mdPath}`);
    const taxonomy = await fetchTaxonomy(config);
    writeTaxonomyCache(config, taxonomy);
    const selectedCategories = new Set((post.categories ?? []).map(Number));
    const selectedTags = new Set((post.tags ?? []).map(Number));
    writeArticle(mdPath, {
      title: post.title?.raw ?? post.title?.rendered ?? '',
      slug,
      description: post.excerpt?.raw ?? '',
      status: post.status,
      created_at: today(),
      updated_at: today(),
      categories: mergeTermOptions(taxonomy.categories.map((term) => ({ ...term })), taxonomy.categories.map((term) => ({ ...term, checked: selectedCategories.has(Number(term.id)) }))),
      tags: mergeTermOptions(taxonomy.tags.map((term) => ({ ...term })), taxonomy.tags.map((term) => ({ ...term, checked: selectedTags.has(Number(term.id)) }))),
      wp_post_id: post.id,
      wp_post_url: post.link,
      wp_media_id: Number(post.featured_media) || null,
      thumbnail: null,
      last_uploaded_at: null,
    }, `\n${post.content?.raw ?? post.content?.rendered ?? ''}\n`);
    console.log(`Imported: ${mdPath}`);
    return;
  }

  if (command === 'check') {
    const taxonomy = await fetchTaxonomy(config);
    console.log(`Connection OK: ${config.siteUrl} (${taxonomy.categories.length} categories, ${taxonomy.tags.length} tags)`);
    return;
  }
  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
