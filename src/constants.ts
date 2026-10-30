export const CONFIG_SECTION = 'luminecloud';
export const VIEW_ID = 'luminecloud.home';
export const CONTAINER_ID = 'luminecloud';
export const OUTPUT_CHANNEL = 'LumineCloud SFTP';
export const PROFILES_SECRET_KEY = 'luminecloud.profiles';
export const SCHEME = 'luminesftp';

export const COMMANDS = {
  scanQr: 'luminecloud.scanQr',
  fromClipboard: 'luminecloud.fromClipboard',
  manualInput: 'luminecloud.manualInput',
  manageProfiles: 'luminecloud.manageProfiles',
  refreshHome: 'luminecloud.refreshHome',
  openSharedFolder: 'luminecloud.openSharedFolder',
} as const;

export const VIEW_COMMANDS = [
  COMMANDS.scanQr,
  COMMANDS.fromClipboard,
  COMMANDS.manualInput,
  COMMANDS.manageProfiles,
  COMMANDS.openSharedFolder,
] as const;
