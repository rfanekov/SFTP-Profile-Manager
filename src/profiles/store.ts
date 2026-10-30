import * as vscode from 'vscode';
import { PROFILES_SECRET_KEY } from '../constants';
import { profileLabel, SftpProfile, StoredProfile } from '../model';

export async function loadProfiles(context: vscode.ExtensionContext): Promise<StoredProfile[]> {
  const raw = await context.secrets.get(PROFILES_SECRET_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredProfile[]) : [];
  } catch {
    return [];
  }
}

export async function saveProfile(
  context: vscode.ExtensionContext,
  profile: SftpProfile & { autoConnect?: boolean },
): Promise<StoredProfile> {
  const profiles = await loadProfiles(context);
  const name = profileLabel(profile);
  const existing = profiles.find((item) => item.name === name);

  const stored: StoredProfile = {
    ...existing,
    ...profile,
    name,
    autoConnect: profile.autoConnect ?? existing?.autoConnect ?? true,
    savedAt: new Date().toISOString(),
  };
  if (!profile.password && existing?.password) {
    stored.password = existing.password;
  }

  const index = profiles.findIndex((item) => item.name === name);
  if (index >= 0) {
    profiles[index] = stored;
  } else {
    profiles.push(stored);
  }
  await context.secrets.store(PROFILES_SECRET_KEY, JSON.stringify(profiles));
  return stored;
}

export async function deleteProfile(context: vscode.ExtensionContext, name: string): Promise<void> {
  const profiles = await loadProfiles(context);
  await context.secrets.store(PROFILES_SECRET_KEY, JSON.stringify(profiles.filter((item) => item.name !== name)));
}
