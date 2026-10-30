import assert from 'node:assert/strict';
import test from 'node:test';
import { connectConfig, entryTypeFromFlag } from '../sftp/client';
import { profileId, profileRootPath } from '../sftp/remote';

test('profileId ổn định và an toàn cho URI authority', () => {
  const id = profileId('Minecraft Survival');
  assert.match(id, /^p[0-9a-f]{12}$/);
  assert.equal(profileId('Minecraft Survival'), id, 'phải ổn định giữa các lần gọi');
  assert.notEqual(profileId('Minecraft Survival 2'), id);
  assert.equal(profileId('Máy chủ Thử'), profileId('Máy chủ Thử'));
});

test('profileRootPath chuẩn hoá đường dẫn gốc', () => {
  assert.equal(profileRootPath(undefined), '/');
  assert.equal(profileRootPath(''), '/');
  assert.equal(profileRootPath('/'), '/');
  assert.equal(profileRootPath('/home/container'), '/home/container');
  assert.equal(profileRootPath('home/container/'), '/home/container');
  assert.equal(profileRootPath('/home/container//'), '/home/container');
});

test('connectConfig dựng đúng tham số kết nối', () => {
  const config = connectConfig({ host: 'node1.example.com', port: 2022, username: 'user.ab12', password: 'pw' });
  assert.equal(config.host, 'node1.example.com');
  assert.equal(config.port, 2022);
  assert.equal(config.username, 'user.ab12');
  assert.equal(config.password, 'pw');
  assert.equal(config.readyTimeout, 20000);
});

test('entryTypeFromFlag ánh xạ ký tự ls', () => {
  assert.equal(entryTypeFromFlag('d'), 'directory');
  assert.equal(entryTypeFromFlag('-'), 'file');
  assert.equal(entryTypeFromFlag('l'), 'symlink');
  assert.equal(entryTypeFromFlag('?'), 'unknown');
});
