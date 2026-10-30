import SftpClient from 'ssh2-sftp-client';

export type RemoteEntryType = 'file' | 'directory' | 'symlink' | 'unknown';

export interface RemoteEntry {
  name: string;
  type: RemoteEntryType;
  size: number;
  mtime: number;
}

export interface ConnectOptions {
  host: string;
  port: number;
  username: string;
  password: string;
}

export function connectConfig(options: ConnectOptions) {
  return {
    host: options.host,
    port: options.port,
    username: options.username,
    password: options.password,
    readyTimeout: 20000,
    retries: 1,
    tryKeyboard: false,
  };
}

export function entryTypeFromFlag(flag: string): RemoteEntryType {
  if (flag.startsWith('d')) {
    return 'directory';
  }
  if (flag.startsWith('-')) {
    return 'file';
  }
  if (flag.startsWith('l')) {
    return 'symlink';
  }
  return 'unknown';
}

export class RemoteClient {
  private readonly client = new SftpClient();
  private closed = false;

  async connect(options: ConnectOptions): Promise<void> {
    await this.client.connect(connectConfig(options));
  }

  onClose(handler: () => void): void {
    const notify = () => {
      this.closed = true;
      handler();
    };
    this.client.on('close', notify);
    this.client.on('end', notify);
  }

  async end(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      await this.client.end();
    } catch {
      // Đóng kết nối đã hỏng — không cần báo lỗi
    }
  }

  async list(path: string): Promise<RemoteEntry[]> {
    const entries = await this.client.list(path);
    return entries
      .filter((entry) => entry.name !== '.' && entry.name !== '..')
      .map((entry) => ({
        name: entry.name,
        type: entryTypeFromFlag(String(entry.type)),
        size: Number(entry.size ?? 0),
        mtime: Number(entry.modifyTime ?? 0),
      }));
  }

  async stat(path: string): Promise<RemoteEntry> {
    const entry = await this.client.stat(path);
    const type: RemoteEntryType = entry.isDirectory
      ? 'directory'
      : entry.isSymbolicLink
        ? 'symlink'
        : entry.isFile
          ? 'file'
          : 'unknown';
    return {
      name: path.split('/').pop() || path,
      type,
      size: Number(entry.size ?? 0),
      mtime: Number(entry.modifyTime ?? 0),
    };
  }

  async readFile(path: string): Promise<Buffer> {
    const result = (await this.client.get(path)) as Buffer | string | NodeJS.ReadableStream;
    if (Buffer.isBuffer(result)) {
      return result;
    }
    if (typeof result === 'string') {
      return Buffer.from(result);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of result as NodeJS.ReadableStream & AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async writeFile(path: string, content: Uint8Array): Promise<void> {
    await this.client.put(Buffer.from(content), path);
  }

  async mkdir(path: string): Promise<void> {
    await this.client.mkdir(path, true);
  }

  async remove(path: string, isDirectory: boolean, recursive: boolean): Promise<void> {
    if (isDirectory) {
      await this.client.rmdir(path, recursive);
    } else {
      await this.client.delete(path, true);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    await this.client.rename(from, to);
  }
}
