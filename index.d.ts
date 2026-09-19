export interface PublisherConfig {
  siteUrl: string;
  apiPath: string;
  contentDir: string;
  entryFile: string;
  taxonomyCache: string;
  defaultPostStatus: string;
  postType: 'posts' | 'pages';
  rootDir: string;
  configPath: string;
  authorId?: number;
  adapter?: string;
  adapterModule?: Record<string, unknown>;
  transport: Record<string, unknown> & { type: 'rest' | 'ssh' };
}

export interface PublishOptions {
  mode?: 'create' | 'update';
  publish?: boolean;
  refreshThumbnail?: boolean;
}

export interface TermOption {
  id: number;
  name: string;
  slug: string;
  checked?: boolean;
}

export interface PublishResult {
  result: { id: number; link: string; status: string; [key: string]: unknown };
  updates: Record<string, unknown>;
  [key: string]: unknown;
}

export function loadConfig(configPath?: string): Promise<PublisherConfig>;
export function publishArticle(config: PublisherConfig, slug: string, options?: PublishOptions): Promise<PublishResult>;
export function fetchPost(config: PublisherConfig, endpoint: string, postId: number): Promise<Record<string, unknown>>;
export function readArticle(filePath: string): { frontmatter: Record<string, unknown>; content: string };
export function writeArticle(filePath: string, frontmatter: Record<string, unknown>, content: string): void;
export function updateArticle(filePath: string, updates: Record<string, unknown>): void;
export function checkedTermIds(terms: unknown): number[];
export function mergeTermOptions(remoteTerms: TermOption[], currentTerms?: TermOption[]): TermOption[];
export function fetchTaxonomy(config: PublisherConfig): Promise<{ syncedAt: string; categories: TermOption[]; tags: TermOption[] }>;
export function writeTaxonomyCache(config: PublisherConfig, taxonomy: unknown): string;
export function applyTaxonomyToArticle(mdPath: string, taxonomy: { categories: TermOption[]; tags: TermOption[] }): void;
export function articlePaths(config: PublisherConfig, slug?: string): string[];
