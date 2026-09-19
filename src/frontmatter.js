import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export function readArticle(filePath) {
  const parsed = matter(fs.readFileSync(filePath, 'utf8'));
  return { frontmatter: parsed.data, content: parsed.content };
}

export function writeArticle(filePath, frontmatter, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, matter.stringify(content, frontmatter), 'utf8');
}

export function updateArticle(filePath, updates) {
  const current = readArticle(filePath);
  writeArticle(filePath, { ...current.frontmatter, ...updates }, current.content);
}

export function checkedTermIds(terms) {
  if (!Array.isArray(terms)) return [];
  return terms
    .filter((term) => term && typeof term === 'object' && term.checked === true)
    .map((term) => Number(term.id))
    .filter(Number.isInteger);
}

export function mergeTermOptions(remoteTerms, currentTerms = []) {
  const selectedIds = new Set(checkedTermIds(currentTerms));
  const selectedSlugs = new Set(
    currentTerms.filter((term) => term?.checked).map((term) => String(term.slug ?? '')),
  );
  return remoteTerms.map(({ id, name, slug }) => ({
    id,
    name,
    slug,
    checked: selectedIds.has(Number(id)) || selectedSlugs.has(slug),
  }));
}
