import { feeds } from './gallery-cache';
import type { PhotoDto } from '../types';
export function photoUrl(photo: Pick<PhotoDto, 'id' | 'title'>) {
  const slug = photo.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '') || 'anh';
  return '/photos/' + slug + '/' + photo.id;
}
export function refreshSocialFeed(kind: string) { for (const key of feeds.keys()) if (key.includes(kind)) feeds.delete(key); window.dispatchEvent(new CustomEvent('social-feed-change', { detail: kind })); }
