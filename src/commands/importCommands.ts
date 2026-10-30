import * as vscode from 'vscode';
import { CmdContext, handlePayload } from './applyPayload';

export async function importFromClipboard(ctx: CmdContext): Promise<void> {
  const text = (await vscode.env.clipboard.readText()).trim();
  if (!text) {
    await vscode.window.showWarningMessage('Clipboard đang trống.');
    return;
  }

  if (!/[{}:=@]/.test(text)) {
    const proceed = await vscode.window.showWarningMessage(
      'Nội dung clipboard trông không giống thông tin kết nối SFTP.',
      'Vẫn thử phân tích',
    );
    if (!proceed) {
      return;
    }
  }

  await handlePayload(text, ctx, { silentRaw: true });
}

export async function manualInput(ctx: CmdContext): Promise<void> {
  const text = await vscode.window.showInputBox({
    title: 'Nhập thông tin SFTP',
    prompt: 'Dán JSON, chuỗi sftp:// hoặc user@host:port',
    placeHolder: 'sftp://user.abc123:matkhau@node.example.com:2022',
    ignoreFocusOut: true,
  });
  if (!text?.trim()) {
    return;
  }
  await handlePayload(text.trim(), ctx);
}
