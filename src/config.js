import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  apiPath: '/wp-json/wp/v2',
  contentDir: 'articles',
  entryFile: 'index.md',
  taxonomyCache: '.wordpress/taxonomy.json',
  defaultPostStatus: 'draft',
  postType: 'posts',
  transport: { type: 'rest' },
};

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
}

export async function loadConfig(configPath = 'wordpress-publisher.config.json') {
  const absolute = path.resolve(configPath);
  if (!fs.existsSync(absolute)) throw new Error(`Config not found: ${absolute}`);
  const extension = path.extname(absolute).toLowerCase();
  const raw = extension === '.json'
    ? JSON.parse(fs.readFileSync(absolute, 'utf8'))
    : (await import(`${pathToFileURL(absolute).href}?t=${Date.now()}`)).default;
  const rootDir = path.dirname(absolute);
  const config = {
    ...DEFAULTS,
    ...raw,
    transport: { ...DEFAULTS.transport, ...(raw.transport ?? {}) },
    rootDir,
    configPath: absolute,
  };
  assertString(config.siteUrl, 'siteUrl');
  assertString(config.contentDir, 'contentDir');
  if (!['rest', 'ssh'].includes(config.transport.type)) {
    throw new Error('transport.type must be rest or ssh');
  }
  if (config.transport.type === 'ssh') {
    assertString(config.transport.host, 'transport.host');
    assertString(config.transport.wordpressRoot, 'transport.wordpressRoot');
    assertString(config.transport.releaseRoot, 'transport.releaseRoot');
    if (!path.isAbsolute(config.transport.releaseRoot)) {
      throw new Error('transport.releaseRoot must be an absolute remote path');
    }
  }
  if (config.adapter) {
    const adapterPath = path.resolve(rootDir, config.adapter);
    config.adapterModule = await import(`${pathToFileURL(adapterPath).href}?t=${Date.now()}`);
  }
  return config;
}

export function resolveConfigPath(config, value) {
  return path.resolve(config.rootDir, value);
}
