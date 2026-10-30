import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CONFIG_SECTION, PROFILES_SECRET_KEY } from '../constants';
import { StoredProfile } from '../model';
import {
  defaultSharedDir,
  KEY_FILE,
  loadOrCreateKey,
  mergeProfiles,
  PasswordMode,
  readSharedFile,
  SHARED_FILE,
  writeSharedFile,
} from './shared';
import { loadProfiles } from './store';

export interface SharedSyncOptions {
  enabled: boolean;
  folder: string;
  passwordMode: PasswordMode;
}

export function resolveSharedFolder(): string {
  const configured = (vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('sharedProfiles.path', '') ?? '').trim();
  if (!configured) {
    return defaultSharedDir(process.platform, process.env, os.homedir());
  }
  if (configured.startsWith('~')) {
    return path.join(os.homedir(), configured.slice(1));
  }
  return configured;
}

export function readSharedSyncOptions(): SharedSyncOptions {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const mode = config.get<string>('sharedProfiles.password', 'encrypted');
  return {
    enabled: config.get<boolean>('sharedProfiles.enabled', true),
    folder: resolveSharedFolder(),
    passwordMode: mode === 'none' || mode === 'plain' ? mode : 'encrypted',
  };
}

export class SharedProfileSync implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly filePath: string;
  private readonly keyPath: string;
  private lastWritten = '';
  private timer: NodeJS.Timeout | undefined;
  private applying = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly options: SharedSyncOptions,
    private readonly onProfilesImported: (profiles: StoredProfile[]) => void,
  ) {
    this.filePath = path.join(options.folder, SHARED_FILE);
    this.keyPath = path.join(options.folder, KEY_FILE);
  }

  get folder(): string {
    return this.options.folder;
  }

  get file(): string {
    return this.filePath;
  }

  async start(): Promise<void> {
    if (!this.options.enabled) {
      this.output.appendLine('[shared] đồng bộ hồ sơ chia sẻ đang tắt');
      return;
    }

    try {
      await fs.mkdir(this.options.folder, { recursive: true });
      await this.push(await loadProfiles(this.context));

      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(this.options.folder), SHARED_FILE),
      );
      this.disposables.push(
        watcher,
        watcher.onDidChange(() => this.schedulePull()),
        watcher.onDidCreate(() => this.schedulePull()),
      );
      this.output.appendLine(`[shared] hồ sơ chia sẻ: ${this.filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[shared] không khởi tạo được thư mục chia sẻ: ${message}`);
    }
  }

  async push(profiles: StoredProfile[]): Promise<void> {
    if (!this.options.enabled) {
      return;
    }
    try {
      const key = await loadOrCreateKey(this.keyPath);
      this.lastWritten = await writeSharedFile(this.filePath, profiles, this.options.passwordMode, key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[shared] không ghi được hồ sơ chia sẻ: ${message}`);
    }
  }

  private schedulePull(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.pull();
    }, 250);
  }

  private async pull(): Promise<void> {
    if (!this.options.enabled || this.applying) {
      return;
    }
    this.applying = true;

    try {
      let raw: string;
      try {
        raw = await fs.readFile(this.filePath, 'utf8');
      } catch {
        return;
      }
      if (raw === this.lastWritten) {
        return;
      }
      this.lastWritten = raw;

      const key = await loadOrCreateKey(this.keyPath);
      const remote = await readSharedFile(this.filePath, key);
      const { merged, changed } = mergeProfiles(await loadProfiles(this.context), remote);
      if (!changed) {
        return;
      }

      await this.context.secrets.store(PROFILES_SECRET_KEY, JSON.stringify(merged));
      this.output.appendLine(`[shared] đã nạp ${remote.length} hồ sơ từ file chia sẻ`);
      this.onProfilesImported(merged);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[shared] lỗi đọc hồ sơ chia sẻ: ${message}`);
    } finally {
      this.applying = false;
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}
