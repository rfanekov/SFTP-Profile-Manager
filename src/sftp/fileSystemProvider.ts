import * as path from 'path';
import * as vscode from 'vscode';
import { RemoteClient, RemoteEntryType } from './client';
import { ConnectionManager } from './connections';

export interface SaveReporter {
  saving(profile: string, file: string): void;
  saved(profile: string, file: string): void;
  failed(profile: string, file: string): void;
}

function remotePath(uri: vscode.Uri): string {
  return uri.path || '/';
}

function fileType(type: RemoteEntryType): vscode.FileType {
  switch (type) {
    case 'directory':
      return vscode.FileType.Directory;
    case 'file':
      return vscode.FileType.File;
    case 'symlink':
      return vscode.FileType.SymbolicLink;
    default:
      return vscode.FileType.Unknown;
  }
}

export function toFileSystemError(error: unknown): Error {
  const err = error as { code?: number | string; message?: string };
  const message = err?.message ?? String(error);
  const code = err?.code;

  if (code === 2 || /no such file/i.test(message)) {
    return vscode.FileSystemError.FileNotFound(message);
  }
  if (code === 3 || /permission denied/i.test(message)) {
    return vscode.FileSystemError.NoPermissions(message);
  }
  if (code === 4 || /already exists/i.test(message)) {
    return vscode.FileSystemError.FileExists(message);
  }
  return vscode.FileSystemError.Unavailable(message);
}

export class SftpFileSystemProvider implements vscode.FileSystemProvider {
  private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.changes.event;

  constructor(
    private readonly connections: ConnectionManager,
    private readonly reporter?: SaveReporter,
  ) {}

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const entry = await this.run(uri, (client, path) => client.stat(path));
    const type = fileType(entry.type);
    return {
      type,
      ctime: entry.mtime,
      mtime: entry.mtime,
      size: type === vscode.FileType.File ? entry.size : 0,
    };
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const entries = await this.run(uri, (client, path) => client.list(path));
    return entries.map((entry) => [entry.name, fileType(entry.type)] as [string, vscode.FileType]);
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const buffer = await this.run(uri, (client, path) => client.readFile(path));
    return new Uint8Array(buffer);
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const profile = this.connections.profileNameOf(uri.authority) ?? 'SFTP';
    const fileName = path.basename(remotePath(uri)) || remotePath(uri);
    this.reporter?.saving(profile, fileName);

    try {
      await this.run(uri, (client, target) => client.writeFile(target, content));
    } catch (error) {
      this.reporter?.failed(profile, fileName);
      throw error;
    }

    this.reporter?.saved(profile, fileName);
    this.changes.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    await this.run(uri, (client, path) => client.mkdir(path));
    this.changes.fire([{ type: vscode.FileChangeType.Created, uri }]);
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    const stat = await this.stat(uri);
    const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;
    await this.run(uri, (client, path) => client.remove(path, isDirectory, options.recursive === true));
    this.changes.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri, _options: { overwrite: boolean }): Promise<void> {
    const client = await this.client(oldUri);
    try {
      await client.rename(remotePath(oldUri), remotePath(newUri));
    } catch (error) {
      throw toFileSystemError(error);
    }
    this.changes.fire([
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    ]);
  }

  async copy(source: vscode.Uri, destination: vscode.Uri, _options: { overwrite: boolean }): Promise<void> {
    const content = await this.readFile(source);
    await this.writeFile(destination, content);
  }

  private async client(uri: vscode.Uri): Promise<RemoteClient> {
    try {
      return await this.connections.clientFor(uri.authority);
    } catch (error) {
      throw toFileSystemError(error);
    }
  }

  private async run<T>(uri: vscode.Uri, action: (client: RemoteClient, path: string) => Promise<T>): Promise<T> {
    const client = await this.client(uri);
    try {
      return await action(client, remotePath(uri));
    } catch (error) {
      throw toFileSystemError(error);
    }
  }
}
