import { createHash } from 'crypto';

export function profileId(name: string): string {
  return `p${createHash('sha1').update(name, 'utf8').digest('hex').slice(0, 12)}`;
}

export function profileRootPath(remotePath: string | undefined): string {
  const raw = (remotePath ?? '').trim();
  if (!raw || raw === '/') {
    return '/';
  }
  const absolute = raw.startsWith('/') ? raw : `/${raw}`;
  return absolute.replace(/\/+$/, '') || '/';
}
