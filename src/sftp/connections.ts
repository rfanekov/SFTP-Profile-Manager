import * as vscode from 'vscode';
import { describeProfile, profileLabel, StoredProfile } from '../model';
import { loadProfiles } from '../profiles/store';
import { RemoteClient } from './client';
import { profileId } from './remote';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface Session {
  status: ConnectionStatus;
  error?: string;
  client?: RemoteClient;
  profile: StoredProfile;
}

export interface ConnectResult {
  ok: boolean;
  error?: string;
}

export class ConnectionManager implements vscode.Disposable {
  private readonly sessions = new Map<string, Session>();
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {}

  listSessions(): { name: string; status: ConnectionStatus }[] {
    return [...this.sessions.values()].map((session) => ({
      name: profileLabel(session.profile),
      status: session.status,
    }));
  }

  profileNameOf(authority: string): string | undefined {
    const session = this.sessions.get(authority);
    return session ? profileLabel(session.profile) : undefined;
  }

  statusOf(id: string): { status: ConnectionStatus; error?: string; profile?: StoredProfile } {
    const session = this.sessions.get(id);
    if (!session) {
      return { status: 'idle' };
    }
    return { status: session.status, error: session.error, profile: session.profile };
  }

  async connect(profile: StoredProfile): Promise<ConnectResult> {
    const id = profileId(profileLabel(profile));
    const existing = this.sessions.get(id);
    if (existing?.status === 'connected') {
      return { ok: true };
    }
    if (existing?.client) {
      await existing.client.end();
    }

    const session: Session = { status: 'connecting', profile };
    this.sessions.set(id, session);
    this.emitter.fire();

    const fail = (message: string): ConnectResult => {
      session.status = 'error';
      session.error = message;
      session.client = undefined;
      this.output.appendLine(`[sftp] ${describeProfile(profile)} — ${message}`);
      this.emitter.fire();
      return { ok: false, error: message };
    };

    if (!profile.host || !profile.username) {
      return fail('Hồ sơ thiếu host hoặc username.');
    }
    if (!profile.password) {
      return fail('Hồ sơ chưa có mật khẩu.');
    }

    const client = new RemoteClient();
    try {
      await client.connect({
        host: profile.host,
        port: profile.port ?? 2022,
        username: profile.username,
        password: profile.password,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message);
    }

    session.client = client;
    session.status = 'connected';
    session.error = undefined;
    client.onClose(() => {
      const current = this.sessions.get(id);
      if (current?.client === client && current.status === 'connected') {
        current.status = 'idle';
        this.output.appendLine(`[sftp] ${describeProfile(profile)} — kết nối đã đóng`);
        this.emitter.fire();
      }
    });

    this.output.appendLine(`[sftp] đã kết nối ${describeProfile(profile)}`);
    this.emitter.fire();
    return { ok: true };
  }

  async disconnect(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }
    if (session.client) {
      await session.client.end();
    }
    this.sessions.delete(id);
    this.emitter.fire();
  }

  async clientFor(authority: string): Promise<RemoteClient> {
    const session = this.sessions.get(authority);
    if (session?.status === 'connected' && session.client) {
      return session.client;
    }

    const profile = (await loadProfiles(this.context)).find((item) => profileId(profileLabel(item)) === authority);
    if (!profile) {
      throw new Error('Không tìm thấy hồ sơ cho kết nối này.');
    }

    const result = await this.connect(profile);
    const connected = this.sessions.get(authority);
    if (!result.ok || !connected?.client) {
      throw new Error(result.error ?? 'Không kết nối được tới máy chủ.');
    }
    return connected.client;
  }

  async autoConnectAll(profiles: StoredProfile[]): Promise<{ connected: StoredProfile[]; failed: StoredProfile[] }> {
    const connected: StoredProfile[] = [];
    const failed: StoredProfile[] = [];
    for (const profile of profiles) {
      const result = await this.connect(profile);
      if (result.ok) {
        connected.push(profile);
      } else {
        failed.push(profile);
      }
    }
    return { connected, failed };
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      void session.client?.end();
    }
    this.sessions.clear();
    this.emitter.dispose();
  }
}
