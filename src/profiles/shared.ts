import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StoredProfile } from '../model';

export const SHARED_FILE = 'profiles.json';
export const KEY_FILE = 'key.bin';
export const SHARED_APP_ID = 'luminecloud-sftp-manager';
export const SHARED_VERSION = 1;

export type PasswordMode = 'none' | 'plain' | 'encrypted';

export interface EncryptedPassword {
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
}

export interface SharedEntry {
  name: string;
  host?: string;
  port?: number;
  username?: string;
  remotePath?: string;
  autoConnect?: boolean;
  updatedAt: string;
  password?: string;
  passwordEnc?: EncryptedPassword;
}

export interface SharedFile {
  app: string;
  version: number;
  updatedAt: string;
  profiles: SharedEntry[];
}

export function defaultSharedDir(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string,
): string {
  if (platform === 'win32') {
    const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'LumineCloud');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'LumineCloud');
  }
  const configHome = env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(configHome, 'luminecloud');
}

export function generateKey(): Buffer {
  return randomBytes(32);
}

export async function loadOrCreateKey(file: string): Promise<Buffer> {
  try {
    const encoded = (await fs.readFile(file, 'utf8')).trim();
    const key = Buffer.from(encoded, 'base64');
    if (key.length === 32) {
      return key;
    }
  } catch {
    // Chưa có key — tạo mới bên dưới
  }

  const key = generateKey();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, key.toString('base64'), { mode: 0o600 });
  if (process.platform !== 'win32') {
    await fs.chmod(file, 0o600).catch(() => undefined);
  }
  return key;
}

export function encryptPassword(password: string, key: Buffer): EncryptedPassword {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return {
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

export function decryptPassword(blob: EncryptedPassword, key: Buffer): string | undefined {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const data = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
    return data.toString('utf8');
  } catch {
    return undefined;
  }
}

export function toSharedEntries(
  profiles: StoredProfile[],
  mode: PasswordMode,
  key: Buffer,
): SharedEntry[] {
  return profiles.map((profile) => {
    const entry: SharedEntry = {
      name: profile.name ?? profile.host ?? 'SFTP',
      host: profile.host,
      port: profile.port ?? 2022,
      username: profile.username,
      remotePath: profile.remotePath,
      autoConnect: profile.autoConnect !== false,
      updatedAt: profile.savedAt,
    };
    if (profile.password && mode === 'plain') {
      entry.password = profile.password;
    } else if (profile.password && mode === 'encrypted') {
      entry.passwordEnc = encryptPassword(profile.password, key);
    }
    return entry;
  });
}

export function fromSharedEntries(entries: SharedEntry[], key: Buffer): StoredProfile[] {
  const profiles: StoredProfile[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || !entry.name) {
      continue;
    }
    const password =
      typeof entry.password === 'string'
        ? entry.password
        : entry.passwordEnc
          ? decryptPassword(entry.passwordEnc, key)
          : undefined;

    profiles.push({
      name: entry.name,
      host: entry.host,
      port: entry.port,
      username: entry.username,
      remotePath: entry.remotePath,
      autoConnect: entry.autoConnect !== false,
      password,
      savedAt: entry.updatedAt || new Date(0).toISOString(),
    });
  }
  return profiles;
}

export function mergeProfiles(
  local: StoredProfile[],
  remote: StoredProfile[],
): { merged: StoredProfile[]; changed: boolean } {
  const byName = new Map<string, StoredProfile>();
  for (const profile of local) {
    byName.set(profile.name ?? profile.host ?? 'SFTP', profile);
  }

  let changed = false;
  for (const incoming of remote) {
    const name = incoming.name ?? incoming.host ?? 'SFTP';
    const current = byName.get(name);
    if (!current) {
      byName.set(name, { ...incoming, name });
      changed = true;
      continue;
    }

    const localTime = Date.parse(current.savedAt) || 0;
    const remoteTime = Date.parse(incoming.savedAt) || 0;
    if (remoteTime > localTime) {
      byName.set(name, {
        ...current,
        ...incoming,
        name,
        password: incoming.password ?? current.password,
        autoConnect: incoming.autoConnect ?? current.autoConnect,
        savedAt: incoming.savedAt,
      });
      changed = true;
    }
  }

  return { merged: [...byName.values()], changed };
}

export async function readSharedFile(file: string, key: Buffer): Promise<StoredProfile[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  let parsed: Partial<SharedFile>;
  try {
    parsed = JSON.parse(raw) as Partial<SharedFile>;
  } catch {
    throw new Error(`File hồ sơ chia sẻ không phải JSON hợp lệ: ${file}`);
  }

  const entries = Array.isArray(parsed.profiles) ? parsed.profiles : [];
  return fromSharedEntries(entries, key);
}

export async function writeSharedFile(
  file: string,
  profiles: StoredProfile[],
  mode: PasswordMode,
  key: Buffer,
): Promise<string> {
  const payload: SharedFile = {
    app: SHARED_APP_ID,
    version: SHARED_VERSION,
    updatedAt: new Date().toISOString(),
    profiles: toSharedEntries(profiles, mode, key),
  };
  const content = `${JSON.stringify(payload, null, 2)}\n`;

  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, content, { mode: 0o600 });
  await fs.rename(temp, file);
  if (process.platform !== 'win32') {
    await fs.chmod(file, 0o600).catch(() => undefined);
  }
  return content;
}
