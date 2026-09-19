import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function today() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((value, index) => index === 0 ? String(value) : String(value).padStart(2, '0'))
    .join('-');
}

export function assertSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Invalid slug: ${slug}`);
  }
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function contentType(filePath) {
  const types = {
    '.avif': 'image/avif', '.gif': 'image/gif', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  };
  return types[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export function imageAlt(filePath) {
  const altPath = filePath.replace(/\.[^.]+$/, '.alt');
  return fs.existsSync(altPath)
    ? fs.readFileSync(altPath, 'utf8').trim()
    : path.basename(filePath, path.extname(filePath));
}

export function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function parseImageReferences(markdown) {
  const values = new Set();
  const markdownImage = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const htmlImage = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const regex of [markdownImage, htmlImage]) {
    let match;
    while ((match = regex.exec(markdown)) !== null) {
      const value = match[1].trim();
      if (!/^(?:https?:|data:|\/\/)/i.test(value)) values.add(decodeURIComponent(value));
    }
  }
  return [...values];
}

export function replaceAllLiteral(value, from, to) {
  return value.split(from).join(to);
}
