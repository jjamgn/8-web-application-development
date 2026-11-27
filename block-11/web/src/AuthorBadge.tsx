import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { PhotoDto } from './types';

export function AuthorBadge({ author, className = '' }: { author: PhotoDto['uploader']; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [author.avatarUrl]);
  const words = author.name.trim().split(/\s+/);
  const initials = [words[0], ...(words.length > 1 ? [words.at(-1)!] : [])].map(word => Array.from(word)[0] ?? '').join('').toUpperCase();
  return <Link className={'author-badge ' + className} to={'/users/' + author.id} title={author.name}>
    <span className="author-avatar" aria-hidden="true">{author.avatarUrl && !failed ? <img src={author.avatarUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : initials}</span>
    <span className="author-name">{author.name}</span>
  </Link>;
}
