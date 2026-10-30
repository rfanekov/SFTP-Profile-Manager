import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  COMMANDS,
  CONFIG_SECTION,
  PROFILES_SECRET_KEY,
  SCHEME,
  VIEW_COMMANDS,
  VIEW_ID,
} from '../constants';
import { getHomeHtml } from '../webview/homeHtml';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')) as {
  displayName: string;
  icon?: string;
  extensionPack?: string[];
  dependencies?: Record<string, string>;
  scripts: Record<string, string>;
  activationEvents: string[];
  contributes: {
    commands: { command: string }[];
    viewsContainers: { activitybar: { id: string; icon: string; title: string }[] };
    views: Record<string, { id: string }[]>;
    menus: Record<string, { command: string; when?: string }[]>;
    configuration: { properties: Record<string, unknown> };
  };
};

test('command id trong code khớp package.json', () => {
  const contributed = new Set(pkg.contributes.commands.map((item) => item.command));
  const used = Object.values(COMMANDS);
  for (const id of used) {
    assert.ok(contributed.has(id), `thiếu "${id}" trong package.json`);
  }
  assert.equal(contributed.size, used.length, 'package.json có lệnh thừa hoặc thiếu');
});

test('activationEvents phủ view, lệnh và file system provider', () => {
  const events = new Set(pkg.activationEvents);
  assert.ok(events.has(`onView:${VIEW_ID}`), `thiếu onView:${VIEW_ID}`);
  assert.ok(events.has(`onFileSystem:${SCHEME}`), `thiếu onFileSystem:${SCHEME}`);
  assert.ok(events.has('onStartupFinished'), 'thiếu onStartupFinished để tự kết nối khi mở VS Code');
  for (const id of VIEW_COMMANDS) {
    assert.ok(events.has(`onCommand:${id}`), `thiếu onCommand:${id}`);
  }
});

test('view container và view lấy đúng id, icon tồn tại', () => {
  const container = pkg.contributes.viewsContainers.activitybar[0];
  assert.equal(container.id, 'luminecloud');
  assert.ok(pkg.contributes.views.luminecloud, 'thiếu khai báo views cho container');
  assert.equal(pkg.contributes.views.luminecloud[0].id, VIEW_ID);
  assert.ok(fs.existsSync(path.join(__dirname, '../../', container.icon)), `không thấy icon ${container.icon}`);
});

test('mọi setting nằm trong namespace cấu hình', () => {
  const keys = Object.keys(pkg.contributes.configuration.properties);
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.ok(key.startsWith(`${CONFIG_SECTION}.`), `"${key}" sai namespace`);
  }
  assert.ok(!keys.some((key) => /sftpJson|sshConfig/.test(key)), 'không còn setting ghi file ngoài hồ sơ');
});

test('nút trên giao diện đều là lệnh đã đăng ký', () => {
  const html = getHomeHtml({ cspSource: 'cdn' } as never, 'n1', []);
  const contributed = new Set(pkg.contributes.commands.map((item) => item.command));
  const buttons = [...html.matchAll(/data-command="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(buttons.length >= 4, 'home view phải có ít nhất 4 nút');
  for (const id of buttons) {
    assert.ok(contributed.has(id), `nút gọi lệnh chưa khai báo: ${id}`);
  }
});

test('menu refresh gắn đúng view', () => {
  const item = pkg.contributes.menus['view/title'][0];
  assert.equal(item.command, COMMANDS.refreshHome);
  assert.equal(item.when, `view == ${VIEW_ID}`);
});

test('branding và dependency SFTP', () => {
  assert.equal(pkg.displayName, 'LumineCloud SFTP Manager');
  assert.ok(pkg.dependencies?.['ssh2-sftp-client'], 'thiếu dependency ssh2-sftp-client');
  assert.equal(pkg.extensionPack, undefined, 'không phụ thuộc extension SFTP bên ngoài');
  assert.ok(PROFILES_SECRET_KEY.startsWith('luminecloud.'));
});

test('VSIX có đóng gói dependency runtime', () => {
  assert.ok(pkg.scripts.package, 'thiếu script package');
  assert.doesNotMatch(pkg.scripts.package, /--no-dependencies/, 'phải đóng gói node_modules/dependencies');
});

test('icon extension là PNG hợp lệ và đủ lớn', () => {
  assert.ok(pkg.icon, 'thiếu trường "icon" trong package.json');
  const iconPath = path.join(__dirname, '../../', pkg.icon);
  assert.ok(fs.existsSync(iconPath), `không thấy ${pkg.icon}`);

  const buffer = fs.readFileSync(iconPath);
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, 'không phải file PNG');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  assert.ok(width >= 128 && height >= 128, `icon chỉ ${width}x${height}, cần tối thiểu 128x128`);
});

test('icon activity bar là SVG 24x24 đơn sắc', () => {
  const iconPath = path.join(__dirname, '../../', pkg.contributes.viewsContainers.activitybar[0].icon);
  const svg = fs.readFileSync(iconPath, 'utf8');
  assert.match(svg, /viewBox="0 0 24 24"/);
  assert.match(svg, /fill="currentColor"/);
  assert.doesNotMatch(svg, /style=/);
});
