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

export function loadConfig(configPath?: string): Promise<PublisherConfig>;
export function publishArticle(config: PublisherConfig, slug: string, options?: PublishOptions): Promise<any>;
export function fetchPost(config: PublisherConfig, endpoint: string, postId: number): Promise<any>;
export function readArticle(filePath: string): { frontmatter: any; content: string };
export function writeArticle(filePath: string, frontmatter: any, content: string): void;
export function updateArticle(filePath: string, updates: Record<string, unknown>): void;
export function checkedTermIds(terms: unknown): number[];
export function mergeTermOptions(remoteTerms: any[], currentTerms?: any[]): any[];
export function fetchTaxonomy(config: PublisherConfig): Promise<any>;
export function writeTaxonomyCache(config: PublisherConfig, taxonomy: any): string;
export function applyTaxonomyToArticle(mdPath: string, taxonomy: any): void;
export function articlePaths(config: PublisherConfig, slug?: string): string[];
