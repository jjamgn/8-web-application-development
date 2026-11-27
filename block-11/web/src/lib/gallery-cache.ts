import type { PhotoDto } from '../types';
export type Feed = { items: PhotoDto[]; page: number; total: number; totalPages: number; scroll: number };
export const feeds = new Map<string, Feed>();
export function invalidateFeeds() { feeds.clear(); }
