import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { marked } from 'marked';
import { checkedTermIds, readArticle, updateArticle } from './frontmatter.js';
import { RestClient } from './rest-client.js';
import { SshClient } from './ssh-client.js';
import { assertSlug, imageAlt, parseImageReferences, replaceAllLiteral, sha256, today } from './utils.js';

function defaultLocation(config, slug) {
  const articleDir = path.resolve(config.rootDir, config.contentDir, slug);
  return { articleDir, mdPath: path.join(articleDir, config.entryFile), endpoint: config.postType };
}

async function locate(config, slug) {
  if (config.adapterModule?.locateArticle) return config.adapterModule.locateArticle({ config, slug });
  return defaultLocation(config, slug);
}

function containedFile(articleDir, relative) {
  const resolved = path.resolve(articleDir, relative);
  const prefix = `${path.resolve(articleDir)}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error(`Image escapes article directory: ${relative}`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Image not found: ${relative}`);
  return resolved;
}

async function prepareFile(config, details, tempDir) {
  if (!config.adapterModule?.prepareMedia) return details.filePath;
  const result = await config.adapterModule.prepareMedia({ ...details, config, tempDir });
  return result?.filePath ?? details.filePath;
}

function clientFor(config) {
  return config.transport.type === 'ssh' ? new SshClient(config) : new RestClient(config);
}

function mediaPlan(frontmatter, content, articleDir, refreshThumbnail) {
  const references = parseImageReferences(content);
  const plan = references.map((relative) => ({
    key: relative,
    relative,
    filePath: containedFile(articleDir, relative),
    featured: false,
  }));
  if (frontmatter.thumbnail) {
    const relative = String(frontmatter.thumbnail);
    const existing = plan.find((item) => item.relative === relative);
    if (existing) existing.featured = true;
    else plan.push({ key: relative, relative, filePath: containedFile(articleDir, relative), featured: true });
  }
  const cached = frontmatter.wp_media && typeof frontmatter.wp_media === 'object' ? frontmatter.wp_media : {};
  return plan.map((item) => ({
    ...item,
    hash: sha256(item.filePath),
    cached: !refreshThumbnail || !item.featured ? cached[item.key] : null,
  }));
}

export async function publishArticle(config, slug, options = {}) {
  assertSlug(slug);
  const mode = options.mode ?? 'create';
  const location = await locate(config, slug);
  if (!location?.mdPath || !fs.existsSync(location.mdPath)) throw new Error(`Article not found: ${location?.mdPath}`);
  const { frontmatter, content } = readArticle(location.mdPath);
  if (!frontmatter.title || !frontmatter.slug) throw new Error('frontmatter.title and frontmatter.slug are required');
  if (frontmatter.slug !== slug) throw new Error(`Slug mismatch: requested=${slug}, frontmatter=${frontmatter.slug}`);
  if (mode === 'create' && frontmatter.wp_post_id) throw new Error('This article already has wp_post_id; use update');
  if (mode === 'update' && !frontmatter.wp_post_id) throw new Error('wp_post_id is required; use publish for a new post');
  const previousStatus = frontmatter.status ?? 'draft';
  const nextStatus = mode === 'create'
    ? (options.publish ? 'publish' : config.defaultPostStatus)
    : (options.publish ? 'publish' : previousStatus);
  const context = { config, slug, mode, options, location, frontmatter, content, previousStatus, nextStatus };
  await config.adapterModule?.beforePublish?.(context);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordpress-publisher-media-'));
  try {
    let html = marked.parse(content);
    const plan = mediaPlan(frontmatter, content, location.articleDir, options.refreshThumbnail === true);
    const mediaState = { ...(frontmatter.wp_media ?? {}) };
    const uploadItems = [];
    let featuredMedia = Number(frontmatter.wp_media_id) || 0;
    for (const item of plan) {
      if (item.cached?.sha256 === item.hash && item.cached?.url && item.cached?.id) {
        html = replaceAllLiteral(html, item.relative, item.cached.url);
        if (item.featured) featuredMedia = Number(item.cached.id);
        continue;
      }
      const preparedPath = await prepareFile(config, item, tempDir);
      uploadItems.push({
        ...item,
        filePath: preparedPath,
        filename: `${slug}-${path.basename(preparedPath)}`,
        alt: imageAlt(item.filePath),
        placeholder: `wp-publisher://media/${encodeURIComponent(item.key)}`,
      });
      html = replaceAllLiteral(html, item.relative, `wp-publisher://media/${encodeURIComponent(item.key)}`);
    }

    let basePayload = {
      title: frontmatter.title,
      content: html,
      slug,
      status: nextStatus,
      excerpt: frontmatter.description ?? '',
      categories: checkedTermIds(frontmatter.categories),
      tags: checkedTermIds(frontmatter.tags),
      author: config.authorId,
      featured_media: featuredMedia || undefined,
    };
    if (config.adapterModule?.extendPayload) {
      basePayload = { ...basePayload, ...(await config.adapterModule.extendPayload({ ...context, payload: basePayload })) };
    }
    const client = clientFor(config);
    let result;
    if (config.transport.type === 'ssh') {
      const featuredItem = uploadItems.find((item) => item.featured);
      result = await client.upsertWithMedia({
        endpoint: location.endpoint ?? config.postType,
        postId: mode === 'update' ? Number(frontmatter.wp_post_id) : 0,
        ...basePayload,
        featuredPlaceholder: featuredItem?.placeholder,
      }, uploadItems);
      for (const item of uploadItems) {
        const uploaded = result.uploaded?.[item.key];
        if (uploaded) mediaState[item.key] = { ...uploaded, sha256: item.hash };
      }
      if (result.featured_media) featuredMedia = Number(result.featured_media);
    } else {
      for (const item of uploadItems) {
        const uploaded = await client.uploadMedia(item);
        mediaState[item.key] = { ...uploaded, sha256: item.hash };
        basePayload.content = replaceAllLiteral(basePayload.content, item.placeholder, uploaded.url);
        if (item.featured) featuredMedia = uploaded.id;
      }
      if (featuredMedia) basePayload.featured_media = featuredMedia;
      result = await client.upsert(
        location.endpoint ?? config.postType,
        mode === 'update' ? Number(frontmatter.wp_post_id) : 0,
        basePayload,
      );
    }
    const now = new Date();
    const updates = {
      status: result.status ?? nextStatus,
      wp_post_id: Number(result.id),
      wp_post_url: result.link,
      wp_media_id: featuredMedia || null,
      wp_media: mediaState,
      last_uploaded_at: now.toISOString(),
      updated_at: today(),
    };
    updateArticle(location.mdPath, updates);
    const completed = { ...context, result, updates, payload: basePayload };
    await config.adapterModule?.afterWrite?.(completed);
    await config.adapterModule?.afterPublish?.(completed);
    return completed;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function fetchPost(config, endpoint, postId) {
  return clientFor(config).getPost(endpoint, postId);
}
