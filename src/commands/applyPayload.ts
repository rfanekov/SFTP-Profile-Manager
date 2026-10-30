import * as vscode from 'vscode';
import { CONFIG_SECTION } from '../constants';
import { describeProfile, maskSecrets, profileLabel, SftpProfile, StoredProfile } from '../model';
import { PayloadError, parseSftpPayload } from '../parse/parsePayload';
import { ConnectionManager } from '../sftp/connections';
import { mountProfile } from '../sftp/mount';
import { loadProfiles, saveProfile } from '../profiles/store';

export interface CmdContext {
  context: vscode.ExtensionContext;
  output: vscode.OutputChannel;
  connections: ConnectionManager;
}

interface PickItem extends vscode.QuickPickItem {
  profile: SftpProfile;
}

export interface HandleOptions {
  silentRaw?: boolean;
}

export async function handlePayload(raw: string, ctx: CmdContext, options: HandleOptions = {}): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  ctx.output.appendLine('');
  ctx.output.appendLine(`=== ${new Date().toLocaleString()} — nhập SFTP từ QR ===`);
  if (!options.silentRaw) {
    ctx.output.appendLine(maskSecrets(raw));
  }

  let profiles: SftpProfile[];
  try {
    profiles = parseSftpPayload(raw, { defaultPort: config.get<number>('defaultPort', 2022) });
  } catch (error) {
    const message = error instanceof PayloadError ? error.message : `Lỗi không xác định: ${(error as Error).message}`;
    ctx.output.appendLine(`Không phân tích được: ${message}`);
    const choice = await vscode.window.showErrorMessage(`Không đọc được thông tin SFTP: ${message}`, 'Xem dữ liệu thô');
    if (choice) {
      await showRawData(raw);
    }
    return;
  }

  const selected = await pickProfile(profiles);
  if (!selected) {
    return;
  }

  const filled = await fillRequired(selected);
  if (!filled) {
    return;
  }

  const withPassword = await ensurePassword(filled);
  if (!withPassword) {
    return;
  }

  const stored = await saveProfile(ctx.context, withPassword);
  ctx.output.appendLine(`Đã lưu hồ sơ "${profileLabel(stored)}" — ${describeProfile(stored)}`);
  await connectSaved(stored, ctx);
}

async function pickProfile(profiles: SftpProfile[]): Promise<SftpProfile | undefined> {
  if (profiles.length === 1) {
    return profiles[0];
  }
  const items: PickItem[] = profiles.map((profile) => ({
    label: `$(server) ${profileLabel(profile)}`,
    description: describeProfile(profile),
    detail: profile.panelUrl ? `Panel: ${profile.panelUrl}` : undefined,
    profile,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Mã QR chứa nhiều máy chủ',
    placeHolder: 'Chọn máy chủ bạn muốn nhập',
  });
  return picked?.profile;
}

async function fillRequired(profile: SftpProfile): Promise<SftpProfile | undefined> {
  const result: SftpProfile = { ...profile };

  if (!result.host) {
    const host = await vscode.window.showInputBox({
      title: 'Thiếu địa chỉ host SFTP',
      prompt: 'Nhập host SFTP (ví dụ: node.example.com)',
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : 'Host không được để trống'),
    });
    if (!host?.trim()) {
      return undefined;
    }
    result.host = host.trim();
  }

  if (!result.username) {
    const username = await vscode.window.showInputBox({
      title: 'Thiếu tên đăng nhập SFTP',
      prompt: 'Nhập username SFTP (ví dụ: user.abc123)',
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : 'Username không được để trống'),
    });
    if (!username?.trim()) {
      return undefined;
    }
    result.username = username.trim();
  }

  if (!result.port || result.port < 1 || result.port > 65535) {
    result.port = vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>('defaultPort', 2022);
  }

  return result;
}

async function ensurePassword(profile: SftpProfile): Promise<SftpProfile | undefined> {
  if (profile.password) {
    return profile;
  }
  const entered = await vscode.window.showInputBox({
    title: 'Mật khẩu SFTP',
    prompt: 'Cần mật khẩu để tự kết nối. Để trống nếu muốn lưu hồ sơ và nối sau.',
    password: true,
    ignoreFocusOut: true,
  });
  if (entered === undefined) {
    return undefined;
  }
  return { ...profile, password: entered || undefined };
}

export async function connectSaved(profile: StoredProfile, ctx: CmdContext): Promise<void> {
  const label = profileLabel(profile);
  if (!profile.password) {
    await vscode.window.showInformationMessage(`Đã lưu hồ sơ "${label}". Chưa có mật khẩu nên chưa kết nối.`);
    return;
  }

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Đang kết nối ${label}…` },
    () => ctx.connections.connect(profile),
  );

  if (!result.ok) {
    const choice = await vscode.window.showErrorMessage(
      `Không kết nối được tới "${label}": ${result.error}`,
      'Xem bảng điều khiển',
    );
    if (choice) {
      ctx.output.show();
    }
    return;
  }

  const mounted = mountProfile(profile);
  await vscode.window.showInformationMessage(
    mounted ? `Đã kết nối "${label}". Thư mục từ xa đã được thêm vào Explorer.` : `Đã kết nối "${label}".`,
  );
}

async function showRawData(raw: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ content: raw, language: 'plaintext' });
  await vscode.window.showTextDocument(document, { preview: true });
}

export async function listProfileItems(ctx: CmdContext): Promise<(vscode.QuickPickItem & { profile: StoredProfile })[]> {
  const profiles = await loadProfiles(ctx.context);
  return profiles.map((profile) => ({
    label: `$(server) ${profileLabel(profile)}`,
    description: describeProfile(profile),
    detail: `Lưu lúc ${new Date(profile.savedAt).toLocaleString('vi-VN')}`,
    profile,
  }));
}
