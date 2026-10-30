import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StoredProfile } from '../model';
import {
  decryptPassword,
  defaultSharedDir,
  encryptPassword,
  generateKey,
  loadOrCreateKey,
  mergeProfiles,
  readSharedFile,
  writeSharedFile,
} from '../profiles/shared';

function profile(overrides: Partial<StoredProfile> = {}): StoredProfile {
  return {
    name: 'Minecraft Survival',
    host: 'node1.example.com',
    port: 2022,
    username: 'user.ab12',
    password: 'mat khau',
    remotePath: '/home/container',
    autoConnect: true,
    savedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'luminecloud-shared-'));
}

test('thư mục mặc định theo từng hệ điều hành', () => {
  assert.equal(
    defaultSharedDir('win32', { APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }, 'C:\\Users\\x'),
    path.join('C:\\Users\\x\\AppData\\Roaming', 'LumineCloud'),
  );
  assert.equal(
    defaultSharedDir('win32', {}, 'C:\\Users\\x'),
    path.join('C:\\Users\\x', 'AppData', 'Roaming', 'LumineCloud'),
  );
  assert.equal(
    defaultSharedDir('darwin', {}, '/Users/x'),
    path.join('/Users/x', 'Library', 'Application Support', 'LumineCloud'),
  );
  assert.equal(defaultSharedDir('linux', {}, '/home/x'), path.join('/home/x', '.config', 'luminecloud'));
  assert.equal(
    defaultSharedDir('linux', { XDG_CONFIG_HOME: '/cfg' }, '/home/x'),
    path.join('/cfg', 'luminecloud'),
  );
});

test('mã hoá mật khẩu AES-256-GCM round-trip', () => {
  const key = generateKey();
  const blob = encryptPassword('mật khẩu tiếng Việt', key);

  assert.equal(blob.alg, 'aes-256-gcm');
  assert.ok(!JSON.stringify(blob).includes('mật khẩu'));
  assert.equal(decryptPassword(blob, key), 'mật khẩu tiếng Việt');
  assert.equal(decryptPassword(blob, generateKey()), undefined, 'key sai phải trả undefined');
  assert.equal(decryptPassword({ ...blob, tag: Buffer.alloc(16).toString('base64') }, key), undefined);
});

test('key.bin được tạo một lần và giữ nguyên', async () => {
  const dir = tempDir();
  const keyPath = path.join(dir, 'key.bin');
  const first = await loadOrCreateKey(keyPath);
  const second = await loadOrCreateKey(keyPath);

  assert.equal(first.length, 32);
  assert.deepEqual(first, second);
  assert.ok(fs.existsSync(keyPath));
});

test('mode=encrypted không ghi mật khẩu dạng plain', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'profiles.json');
  const key = await loadOrCreateKey(path.join(dir, 'key.bin'));

  const content = await writeSharedFile(file, [profile()], 'encrypted', key);
  const parsed = JSON.parse(content) as { app: string; version: number; profiles: { passwordEnc?: unknown; password?: string }[] };

  assert.equal(parsed.app, 'luminecloud-sftp-manager');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.profiles[0].password, undefined);
  assert.ok(parsed.profiles[0].passwordEnc);
  assert.ok(!content.includes('"mat khau"'));

  const readBack = await readSharedFile(file, key);
  assert.equal(readBack[0].password, 'mat khau');
  assert.equal(readBack[0].host, 'node1.example.com');
  assert.equal(readBack[0].savedAt, '2026-01-01T10:00:00.000Z');
});

test('mode=plain và mode=none', async () => {
  const dir = tempDir();
  const key = await loadOrCreateKey(path.join(dir, 'key.bin'));

  const plain = await writeSharedFile(path.join(dir, 'p.json'), [profile()], 'plain', key);
  assert.match(plain, /"password": "mat khau"/);

  const none = await writeSharedFile(path.join(dir, 'n.json'), [profile()], 'none', key);
  assert.doesNotMatch(none, /"password/);

  const readNone = await readSharedFile(path.join(dir, 'n.json'), key);
  assert.equal(readNone[0].password, undefined);
  assert.equal(readNone[0].name, 'Minecraft Survival');
});

test('đọc file không tồn tại trả mảng rỗng', async () => {
  const key = generateKey();
  assert.deepEqual(await readSharedFile(path.join(tempDir(), 'missing.json'), key), []);
});

test('merge: bản mới hơn thắng, giữ mật khẩu local khi remote không có', () => {
  const local = profile({ savedAt: '2026-01-01T00:00:00.000Z', remotePath: '/old' });
  const newerRemote = profile({ savedAt: '2026-02-01T00:00:00.000Z', remotePath: '/new', password: undefined });

  const { merged, changed } = mergeProfiles([local], [newerRemote]);
  assert.equal(changed, true);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].remotePath, '/new');
  assert.equal(merged[0].password, 'mat khau', 'remote thiếu mật khẩu thì giữ của local');
});

test('merge: local mới hơn thì giữ local', () => {
  const local = profile({ savedAt: '2026-03-01T00:00:00.000Z', remotePath: '/local' });
  const olderRemote = profile({ savedAt: '2026-01-01T00:00:00.000Z', remotePath: '/remote' });

  const { merged, changed } = mergeProfiles([local], [olderRemote]);
  assert.equal(changed, false);
  assert.equal(merged[0].remotePath, '/local');
});

test('merge: thêm hồ sơ mới từ file chia sẻ, không xoá hồ sơ đang có', () => {
  const local = profile({ name: 'Local Only' });
  const remote = profile({ name: 'From Companion App', host: 'node5.example.com' });

  const { merged, changed } = mergeProfiles([local], [remote]);
  assert.equal(changed, true);
  assert.deepEqual(merged.map((item) => item.name).sort(), ['From Companion App', 'Local Only']);
});
