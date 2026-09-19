import fs from 'node:fs';
import path from 'node:path';
import { contentType } from './utils.js';

async function responseJson(response) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(`WordPress REST ${response.status}: ${body.message ?? text}`);
  return body;
}

export class RestClient {
  constructor(config) {
    this.baseUrl = `${config.siteUrl.replace(/\/$/, '')}${config.apiPath}`;
    const usernameEnv = config.transport.usernameEnv ?? 'WP_USER';
    const passwordEnv = config.transport.applicationPasswordEnv ?? 'WP_APP_PASSWORD';
    const username = process.env[usernameEnv]?.trim();
    const password = process.env[passwordEnv]?.trim();
    if (!username || !password) {
      throw new Error(`REST credentials are required in ${usernameEnv} and ${passwordEnv}`);
    }
    this.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  async request(pathname, options = {}) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...options,
      headers: { Authorization: this.authorization, ...options.headers },
    });
    return responseJson(response);
  }

  async fetchTerms(taxonomy) {
    const values = [];
    for (let page = 1; ; page += 1) {
      const response = await fetch(`${this.baseUrl}/${taxonomy}?per_page=100&page=${page}&orderby=name&order=asc`, {
        headers: { Authorization: this.authorization },
      });
      if (response.status === 400 && page > 1) break;
      const items = await responseJson(response);
      values.push(...items.map(({ id, name, slug }) => ({ id, name, slug })));
      if (items.length < 100) break;
    }
    return values;
  }

  async uploadMedia({ filePath, filename, alt }) {
    const data = fs.readFileSync(filePath);
    const body = new FormData();
    body.append('file', new Blob([data], { type: contentType(filePath) }), filename ?? path.basename(filePath));
    body.append('alt_text', alt ?? '');
    const result = await this.request('/media', { method: 'POST', body });
    return { id: result.id, url: result.source_url };
  }

  async upsert(endpoint, postId, payload) {
    return this.request(`/${endpoint}${postId ? `/${postId}` : ''}`, {
      method: postId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async getPost(endpoint, postId) {
    return this.request(`/${endpoint}/${postId}?context=edit`);
  }
}
