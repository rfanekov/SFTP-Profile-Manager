import * as vscode from 'vscode';
import { CmdContext } from './commands/applyPayload';
import { importFromClipboard, manualInput } from './commands/importCommands';
import { manageProfiles } from './commands/manageProfiles';
import { COMMANDS, CONFIG_SECTION, OUTPUT_CHANNEL, PROFILES_SECRET_KEY, SCHEME, VIEW_ID } from './constants';
import { isAutoConnect, profileLabel, StoredProfile } from './model';
import { loadProfiles } from './profiles/store';
import { readSharedSyncOptions, SharedProfileSync } from './profiles/sync';
import { ConnectionManager } from './sftp/connections';
import { SftpFileSystemProvider } from './sftp/fileSystemProvider';
import { mountProfile } from './sftp/mount';
import { profileId } from './sftp/remote';
import { StatusBar } from './ui/statusBar';
import { HomeViewProvider } from './webview/homeViewProvider';
import { openScannerPanel } from './webview/scannerPanel';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL);
  const connections = new ConnectionManager(context, output);
  const statusBar = new StatusBar(connections);
  const ctx: CmdContext = { context, output, connections };
  const home = new HomeViewProvider(ctx);

  let sharedSync = createSharedSync(context, output, connections);

  context.subscriptions.push(
    output,
    connections,
    statusBar,
    vscode.workspace.registerFileSystemProvider(SCHEME, new SftpFileSystemProvider(connections, statusBar), {
      isCaseSensitive: true,
    }),
    vscode.window.registerWebviewViewProvider(VIEW_ID, home),
    vscode.commands.registerCommand(COMMANDS.scanQr, () => openScannerPanel(ctx)),
    vscode.commands.registerCommand(COMMANDS.fromClipboard, () => importFromClipboard(ctx)),
    vscode.commands.registerCommand(COMMANDS.manualInput, () => manualInput(ctx)),
    vscode.commands.registerCommand(COMMANDS.manageProfiles, () => manageProfiles(ctx)),
    vscode.commands.registerCommand(COMMANDS.refreshHome, () => home.refresh()),
    vscode.commands.registerCommand(COMMANDS.openSharedFolder, () => openSharedFolder()),
    context.secrets.onDidChange((event) => {
      if (event.key !== PROFILES_SECRET_KEY) {
        return;
      }
      void home.refresh();
      void loadProfiles(context).then((profiles) => sharedSync.push(profiles));
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(`${CONFIG_SECTION}.sharedProfiles`)) {
        return;
      }
      sharedSync.dispose();
      sharedSync = createSharedSync(context, output, connections);
      void sharedSync.start();
      void home.refresh();
    }),
  );

  void sharedSync.start();
  void autoConnectStoredProfiles(ctx);
}

function createSharedSync(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  connections: ConnectionManager,
): SharedProfileSync {
  const options = readSharedSyncOptions();
  return new SharedProfileSync(context, output, options, (profiles) => {
    for (const profile of profiles) {
      if (!isAutoConnect(profile) || !profile.password) {
        continue;
      }
      const status = connections.statusOf(profileId(profileLabel(profile))).status;
      if (status === 'connected' || status === 'connecting') {
        continue;
      }
      void connections.connect(profile).then((result) => {
        if (result.ok) {
          mountProfile(profile);
        }
      });
    }
  });
}

async function openSharedFolder(): Promise<void> {
  const folder = readSharedSyncOptions().folder;
  try {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folder));
  } catch {
    await vscode.env.openExternal(vscode.Uri.file(folder));
  }
}

async function autoConnectStoredProfiles(ctx: CmdContext): Promise<void> {
  const profiles: StoredProfile[] = (await loadProfiles(ctx.context)).filter(
    (profile) => isAutoConnect(profile) && profile.password,
  );
  if (profiles.length === 0) {
    return;
  }

  const { connected, failed } = await ctx.connections.autoConnectAll(profiles);
  for (const profile of connected) {
    mountProfile(profile);
  }

  if (failed.length > 0) {
    const choice = await vscode.window.showWarningMessage(
      `Không kết nối được ${failed.length}/${profiles.length} hồ sơ SFTP.`,
      'Xem bảng điều khiển',
    );
    if (choice) {
      ctx.output.show();
    }
  }
}

export function deactivate(): void {}
