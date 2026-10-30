import * as vscode from 'vscode';
import { SCHEME } from '../constants';
import { profileLabel, StoredProfile } from '../model';
import { profileId, profileRootPath } from './remote';

export function profileUri(profile: StoredProfile): vscode.Uri {
  return vscode.Uri.from({
    scheme: SCHEME,
    authority: profileId(profileLabel(profile)),
    path: profileRootPath(profile.remotePath),
  });
}

export function isMounted(profile: StoredProfile): boolean {
  const id = profileId(profileLabel(profile));
  return (vscode.workspace.workspaceFolders ?? []).some(
    (folder) => folder.uri.scheme === SCHEME && folder.uri.authority === id,
  );
}

export function mountProfile(profile: StoredProfile): boolean {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || isMounted(profile)) {
    return false;
  }
  return (
    vscode.workspace.updateWorkspaceFolders(folders.length, 0, {
      uri: profileUri(profile),
      name: profileLabel(profile),
    }) ?? false
  );
}

export function unmountProfile(name: string): void {
  const id = profileId(name);
  const folders = vscode.workspace.workspaceFolders ?? [];
  const index = folders.findIndex((folder) => folder.uri.scheme === SCHEME && folder.uri.authority === id);
  if (index >= 0) {
    vscode.workspace.updateWorkspaceFolders(index, 1);
  }
}
