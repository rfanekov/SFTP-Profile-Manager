import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { CmdContext } from '../commands/applyPayload';
import { profileActions } from '../commands/manageProfiles';
import { VIEW_COMMANDS } from '../constants';
import { profileLabel, StoredProfile } from '../model';
import { profileId } from '../sftp/remote';
import { readSharedSyncOptions } from '../profiles/sync';
import { loadProfiles } from '../profiles/store';
import { getHomeHtml, HomeProfile } from './homeHtml';

const ALLOWED_COMMANDS = new Set<string>(VIEW_COMMANDS);

export class HomeViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private connectionListener: vscode.Disposable | undefined;

  constructor(private readonly ctx: CmdContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.context.extensionUri, 'media')],
    };

    void this.render();

    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.pushProfiles();
      }
    });

    view.onDidDispose(() => {
      this.connectionListener?.dispose();
      this.connectionListener = undefined;
    });
    this.connectionListener = this.ctx.connections.onDidChange(() => {
      void this.pushProfiles();
    });

    view.webview.onDidReceiveMessage(async (message: { type?: string; command?: string; name?: string }) => {
      if (message?.type === 'command' && message.command && ALLOWED_COMMANDS.has(message.command)) {
        await vscode.commands.executeCommand(message.command);
        await this.pushProfiles();
        return;
      }

      if (message?.type === 'profile' && typeof message.name === 'string') {
        const found = (await loadProfiles(this.ctx.context)).find((item) => profileLabel(item) === message.name);
        if (found) {
          await profileActions(this.ctx, found);
          await this.pushProfiles();
        }
      }
    });
  }

  async refresh(): Promise<void> {
    if (this.view) {
      await this.pushProfiles();
    }
  }

  private async profilesForView(): Promise<HomeProfile[]> {
    const profiles = await loadProfiles(this.ctx.context);
    return profiles.map((profile: StoredProfile) => {
      const { status, error } = this.ctx.connections.statusOf(profileId(profileLabel(profile)));
      return {
        name: profileLabel(profile),
        host: profile.host ?? '?',
        username: profile.username ?? '?',
        port: profile.port ?? 2022,
        status,
        autoConnect: profile.autoConnect !== false,
        error,
      };
    });
  }

  private async render(): Promise<void> {
    if (!this.view) {
      return;
    }
    const nonce = randomBytes(16).toString('base64');
    const shared = readSharedSyncOptions();
    this.view.webview.html = getHomeHtml(this.view.webview, nonce, await this.profilesForView(), {
      sharedPath: shared.enabled ? shared.folder : undefined,
    });
  }

  private async pushProfiles(): Promise<void> {
    if (!this.view) {
      return;
    }
    await this.view.webview.postMessage({ type: 'profiles', profiles: await this.profilesForView() });
  }
}
