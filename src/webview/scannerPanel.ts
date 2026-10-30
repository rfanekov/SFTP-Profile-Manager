import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { CmdContext, handlePayload } from '../commands/applyPayload';
import { getScannerHtml } from './scannerHtml';

export function openScannerPanel(ctx: CmdContext): void {
  const panel = vscode.window.createWebviewPanel(
    'luminecloudScanner',
    'Quét mã QR — SFTP Pterodactyl',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(ctx.context.extensionUri, 'media')],
    },
  );

  const nonce = randomBytes(16).toString('base64');
  panel.webview.html = getScannerHtml(panel.webview, ctx.context.extensionUri, nonce);

  let handled = false;
  panel.webview.onDidReceiveMessage(async (message: { type?: string; text?: string }) => {
    if (handled || message?.type !== 'decoded' || typeof message.text !== 'string') {
      return;
    }
    handled = true;
    panel.dispose();
    await handlePayload(message.text, ctx);
  });
}
