import * as vscode from 'vscode';
import { profileLabel, sftpUrl, StoredProfile } from '../model';
import { unmountProfile } from '../sftp/mount';
import { profileId } from '../sftp/remote';
import { deleteProfile, saveProfile } from '../profiles/store';
import { CmdContext, connectSaved, listProfileItems } from './applyPayload';

interface ProfileActionItem extends vscode.QuickPickItem {
  id: 'connect' | 'disconnect' | 'toggleAuto' | 'copy' | 'delete';
}

export async function manageProfiles(ctx: CmdContext): Promise<void> {
  const items = await listProfileItems(ctx);
  if (items.length === 0) {
    await vscode.window.showInformationMessage('Chưa có hồ sơ SFTP nào được lưu.');
    return;
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Hồ sơ SFTP đã lưu',
    placeHolder: 'Chọn hồ sơ để thao tác',
  });
  if (!picked) {
    return;
  }

  await profileActions(ctx, picked.profile);
}

export async function profileActions(ctx: CmdContext, profile: StoredProfile): Promise<void> {
  const name = profileLabel(profile);
  const id = profileId(name);
  const { status } = ctx.connections.statusOf(id);
  const autoConnect = profile.autoConnect !== false;

  const actions: ProfileActionItem[] = [
    status === 'connected'
      ? { id: 'disconnect', label: '$(debug-disconnect) Ngắt kết nối' }
      : { id: 'connect', label: '$(plug) Kết nối' },
    {
      id: 'toggleAuto',
      label: autoConnect ? '$(circle-slash) Tắt tự động kết nối' : '$(play) Bật tự động kết nối',
      description: autoConnect ? 'đang bật' : 'đang tắt',
    },
    { id: 'copy', label: '$(clippy) Copy chuỗi kết nối' },
    { id: 'delete', label: '$(trash) Xoá hồ sơ' },
  ];

  const action = await vscode.window.showQuickPick(actions, { title: `${name} — ${status}` });
  if (!action) {
    return;
  }

  switch (action.id) {
    case 'connect':
      await connectSaved(profile, ctx);
      return;

    case 'disconnect':
      await ctx.connections.disconnect(id);
      unmountProfile(name);
      await vscode.window.showInformationMessage(`Đã ngắt kết nối "${name}".`);
      return;

    case 'toggleAuto': {
      const stored = await saveProfile(ctx.context, { ...profile, autoConnect: !autoConnect });
      await vscode.window.showInformationMessage(
        `Đã ${stored.autoConnect ? 'bật' : 'tắt'} tự động kết nối cho "${name}".`,
      );
      return;
    }

    case 'copy':
      await vscode.env.clipboard.writeText(sftpUrl(profile));
      await vscode.window.showInformationMessage(`Đã copy chuỗi kết nối cho "${name}".`);
      return;

    case 'delete': {
      const confirm = await vscode.window.showWarningMessage(`Xoá hồ sơ "${name}"?`, { modal: true }, 'Xoá');
      if (confirm !== 'Xoá') {
        return;
      }
      await ctx.connections.disconnect(id);
      unmountProfile(name);
      await deleteProfile(ctx.context, name);
      await vscode.window.showInformationMessage('Đã xoá hồ sơ.');
      return;
    }
  }
}
