import { SftpProfile } from '../model';

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadError';
  }
}

const ALIASES = {
  host: ['host', 'hostname', 'sftphost', 'sftpip', 'ip', 'address', 'serveraddress', 'domain', 'endpoint', 'node'],
  port: ['port', 'sftpport'],
  username: ['username', 'user', 'sftpusername', 'sftpuser', 'login', 'account'],
  password: ['password', 'passwd', 'pass', 'pwd', 'sftppassword', 'sftppass'],
  name: ['name', 'label', 'title', 'servername', 'sftpname', 'displayname'],
  remotePath: ['remotepath', 'sftppath', 'path', 'directory', 'root'],
  panelUrl: ['panelurl', 'panel', 'url', 'baseurl', 'paneladdress'],
  serverId: ['serverid', 'serveridentifier', 'identifier', 'uuid', 'id'],
} as const;

type FieldName = keyof typeof ALIASES;

const CONTAINER_KEYS = new Set(['attributes', 'data', 'server', 'connection', 'details', 'result', 'payload']);
const LIST_KEYS = ['servers', 'profiles', 'connections', 'items', 'accounts', 'data'];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface ParseOptions {
  defaultPort?: number;
}

export function parseSftpPayload(raw: string, options: ParseOptions = {}): SftpProfile[] {
  const defaultPort = options.defaultPort ?? 2022;
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) {
    throw new PayloadError('Nội dung QR rỗng.');
  }

  const urlEncoded = tryUrlEncoded(text);
  if (urlEncoded) {
    return parseSftpPayload(urlEncoded, options);
  }

  const json = tryJson(text);
  if (json !== undefined) {
    return profilesFromJson(json, defaultPort, text);
  }

  const base64 = tryBase64(text);
  if (base64) {
    const decodedJson = tryJson(base64);
    if (decodedJson !== undefined) {
      return profilesFromJson(decodedJson, defaultPort, base64);
    }
    return parseSftpPayload(base64, options);
  }

  const dsn = tryDsn(text, defaultPort);
  if (dsn) {
    return [dsn];
  }

  const compact = tryCompact(text, defaultPort);
  if (compact) {
    return [compact];
  }

  const keyValue = tryKeyValue(text, defaultPort);
  if (keyValue) {
    return [keyValue];
  }

  throw new PayloadError(
    'Không nhận dạng được nội dung QR. Hỗ trợ: JSON, sftp://user:pass@host:port, "user@host:port", hoặc các dòng key=value.',
  );
}

function profilesFromJson(data: unknown, defaultPort: number, source: string): SftpProfile[] {
  if (Array.isArray(data)) {
    const profiles = data
      .map((item) => (isObject(item) ? fromObject(item, defaultPort) : undefined))
      .filter((item): item is SftpProfile => item !== undefined);
    if (profiles.length === 0) {
      throw new PayloadError('Mảng JSON không chứa thông tin kết nối hợp lệ.');
    }
    return profiles;
  }

  if (isObject(data)) {
    for (const key of LIST_KEYS) {
      const nested = data[key];
      if (Array.isArray(nested) && nested.some(isObject)) {
        return profilesFromJson(nested, defaultPort, source);
      }
    }
    const profile = fromObject(data, defaultPort);
    if (!profile) {
      throw new PayloadError(`Không tìm thấy host/username trong JSON: ${truncate(source)}`);
    }
    return [profile];
  }

  throw new PayloadError('JSON hợp lệ nhưng không phải object chứa thông tin SFTP.');
}

function fromObject(obj: Record<string, unknown>, defaultPort: number): SftpProfile | undefined {
  const flat = new Map<string, string>();
  flatten(obj, flat);
  const profile = fromFlat(flat, defaultPort);
  const found = [profile.host, profile.username, profile.password].filter(Boolean).length;
  return found > 0 ? profile : undefined;
}

function flatten(value: unknown, out: Map<string, string>, depth = 0): void {
  if (!isObject(value) || depth > 4) {
    return;
  }
  const entries = Object.entries(value).sort((a, b) => containerScore(a[0]) - containerScore(b[0]));
  for (const [key, child] of entries) {
    if (isObject(child)) {
      flatten(child, out, depth + 1);
      continue;
    }
    if (child === null || child === undefined || typeof child === 'object') {
      continue;
    }
    const normalized = normalizeKey(key);
    if (!out.has(normalized)) {
      out.set(normalized, String(child));
    }
  }
}

function containerScore(key: string): number {
  const normalized = normalizeKey(key);
  if (normalized.includes('sftp')) return 0;
  if (CONTAINER_KEYS.has(normalized)) return 1;
  return 2;
}

function fromFlat(flat: Map<string, string>, defaultPort: number): SftpProfile {
  const lookup = (field: FieldName): string | undefined => {
    for (const alias of ALIASES[field]) {
      const value = flat.get(alias);
      if (value !== undefined && value.trim() !== '') {
        return value.trim();
      }
    }
    return undefined;
  };

  const host = lookup('host');
  const username = lookup('username');
  const password = lookup('password');

  let port = defaultPort;
  const rawPort = lookup('port');
  if (rawPort) {
    const parsed = Number.parseInt(rawPort.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      port = parsed;
    }
  }

  const panelRaw = lookup('panelUrl');
  const panelUrl = panelRaw && /^https?:\/\//i.test(panelRaw) ? panelRaw : undefined;

  const pathRaw = lookup('remotePath');
  const remotePath = pathRaw && pathRaw.startsWith('/') ? pathRaw : undefined;

  return {
    name: lookup('name'),
    host: host ? host.replace(/^\[|\]$/g, '') : undefined,
    port,
    username,
    password,
    remotePath,
    panelUrl,
    serverId: lookup('serverId'),
  };
}

function tryJson(text: string): unknown | undefined {
  const direct = safeJson(text);
  if (direct !== undefined) {
    return direct;
  }
  const start = text.search(/[[{]/);
  if (start === -1) {
    return undefined;
  }
  const candidate = text.slice(start);
  const fromBrace = safeJson(candidate);
  if (fromBrace !== undefined) {
    return fromBrace;
  }
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (end > 0) {
    const trimmed = candidate.slice(0, end + 1);
    if (trimmed !== candidate) {
      return safeJson(trimmed);
    }
  }
  return undefined;
}

function safeJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function tryUrlEncoded(text: string): string | undefined {
  if (!/%7[Bb]/.test(text) || !text.includes('%')) {
    return undefined;
  }
  try {
    const decoded = decodeURIComponent(text);
    return decoded !== text ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function tryBase64(text: string): string | undefined {
  const compact = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]{12,}={0,2}$/.test(compact)) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(compact, 'base64').toString('utf8');
    if (!/^[\x09\x0a\x0d\x20-\x7e]+$/.test(decoded)) {
      return undefined;
    }
    return /[{}:=@]/.test(decoded) ? decoded.trim() : undefined;
  } catch {
    return undefined;
  }
}

function tryDsn(text: string, defaultPort: number): SftpProfile | undefined {
  if (!/^sftp:\/\//i.test(text)) {
    return undefined;
  }
  try {
    const url = new URL(text);
    return {
      host: url.hostname || undefined,
      port: url.port ? Number.parseInt(url.port, 10) : defaultPort,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      remotePath: url.pathname && url.pathname !== '/' ? url.pathname : undefined,
    };
  } catch {
    return undefined;
  }
}

function tryCompact(text: string, defaultPort: number): SftpProfile | undefined {
  const userAtHost = text.match(/^([^\s@/:]+)@([^\s:/]+):(\d+)(?:\s+(\S+))?$/);
  if (userAtHost) {
    return {
      username: userAtHost[1],
      host: userAtHost[2],
      port: Number.parseInt(userAtHost[3], 10) || defaultPort,
      password: userAtHost[4],
    };
  }
  const hostPortUser = text.match(/^([^\s:/]+):(\d+)\s+(\S+)\s+(\S+)$/);
  if (hostPortUser) {
    return {
      host: hostPortUser[1],
      port: Number.parseInt(hostPortUser[2], 10) || defaultPort,
      username: hostPortUser[3],
      password: hostPortUser[4],
    };
  }
  return undefined;
}

function tryKeyValue(text: string, defaultPort: number): SftpProfile | undefined {
  const map = new Map<string, string>();
  const lines = text.split(/[\r\n;&]+/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9 _.\-]*?)\s*[:=]\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const key = normalizeKey(match[1]);
    const value = match[2].replace(/^["'`]|["'`]$/g, '').trim();
    if (value && !map.has(key)) {
      map.set(key, value);
    }
  }
  if (map.size === 0) {
    return undefined;
  }
  const profile = fromFlat(map, defaultPort);
  const found = [profile.host, profile.username, profile.password].filter(Boolean).length;
  return found > 0 ? profile : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
