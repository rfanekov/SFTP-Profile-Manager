import * as vscode from 'vscode';
import { CONTAINER_ID } from '../constants';
import { ConnectionManager, ConnectionStatus } from '../sftp/connections';
import type { SaveReporter } from '../sftp/fileSystemProvider';

const SAVED_RESET_MS = 2500;
const FAILED_RESET_MS = 6000;

function statusIcon(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return '$(pass-filled)';
    case 'connecting':
      return '$(sync~spin)';
    case 'error':
      return '$(error)';
    default:
      return '$(circle-outline)';
  }
}

export class StatusBar implements vscode.Disposable, SaveReporter {
  private readonly item: vscode.StatusBarItem;
  private readonly listener: vscode.Disposable;
  private timer: NodeJS.Timeout | undefined;
  private busy = false;

  constructor(private readonly connections: ConnectionManager) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = `workbench.view.extension.${CONTAINER_ID}`;
    this.item.show();
    this.listener = connections.onDidChange(() => this.refresh());
    this.refresh();
  }

  refresh(): void {
    if (this.busy || this.timer) {
      return;
    }
    const sessions = this.connections.listSessions();
    const connected = sessions.filter((session) => session.status === 'connected').length;
    this.item.text = connected > 0 ? `$(cloud) SFTP ${connected}/${sessions.length}` : '$(cloud) SFTP';

    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.appendMarkdown('**LumineCloud SFTP**\n\n');
    if (sessions.length === 0) {
      tooltip.appendMarkdown('_Chưa có hồ sơ_\n\n');
    }
    for (const session of sessions) {
      tooltip.appendMarkdown(`${statusIcon(session.status)} ${session.name} — ${session.status}\n\n`);
    }
    tooltip.appendMarkdown(`[Mở bảng điều khiển](command:workbench.view.extension.${CONTAINER_ID})`);
    this.item.tooltip = tooltip;
  }

  saving(profile: string, file: string): void {
    this.busy = true;
    this.setMessage(`$(cloud-upload) Đang lưu ${file}…`, `Đang gửi ${file} lên ${profile}`);
  }

  saved(profile: string, file: string): void {
    this.busy = false;
    this.setMessage(`$(check) Đã lưu ${file}`, `${file} đã được ghi lên ${profile}`, SAVED_RESET_MS);
  }

  failed(profile: string, file: string): void {
    this.busy = false;
    this.setMessage(`$(error) Lỗi lưu ${file}`, `Không ghi được ${file} lên ${profile}`, FAILED_RESET_MS);
  }

  private setMessage(text: string, tooltip: string, resetAfter = 0): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.item.text = text;
    this.item.tooltip = tooltip;
    if (resetAfter > 0) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.refresh();
      }, resetAfter);
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.listener.dispose();
    this.item.dispose();
  }
}
