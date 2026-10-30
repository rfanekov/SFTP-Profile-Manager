export interface SftpProfile {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  remotePath?: string;
  panelUrl?: string;
  serverId?: string;
}

export interface StoredProfile extends SftpProfile {
  savedAt: string;
  autoConnect?: boolean;
}

export function isAutoConnect(profile: SftpProfile & { autoConnect?: boolean }): boolean {
  return profile.autoConnect !== false;
}

export function describeProfile(p: SftpProfile): string {
  const user = p.username ?? '?';
  const host = p.host ?? '?';
  const port = p.port ?? 2022;
  return `${user}@${host}:${port}`;
}

export function profileLabel(p: SftpProfile): string {
  return p.name || p.serverId || p.host || 'SFTP';
}

export function sftpUrl(p: SftpProfile): string {
  const user = encodeURIComponent(p.username ?? '');
  const path = p.remotePath && p.remotePath !== '/' ? p.remotePath : '';
  return `sftp://${user}@${p.host}:${p.port ?? 2022}${path}`;
}

export function maskSecrets(raw: string): string {
  return raw
    .replace(/("?(?:password|passwd|pass|pwd|sftp_password)"?\s*[:=]\s*)"([^"]*)"/gi, (_m, k: string) => `${k}"***"`)
    .replace(/(sftp:\/\/[^:/@\s]+):[^@\s]*@/gi, '$1:***@')
    .replace(/(\b(?:password|passwd|pwd|pass)\s*=\s*)(\S+)/gi, '$1***');
}
