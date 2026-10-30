import assert from 'node:assert/strict';
import test from 'node:test';
import { PayloadError, parseSftpPayload } from '../parse/parsePayload';

const pterodactylPayload = {
  attributes: {
    name: 'Minecraft Survival',
    identifier: 'abc123xy',
    sftp_details: {
      ip: 'node1.example.com',
      port: 2022,
      username: 'user.abc123xy',
    },
  },
};

test('đọc JSON phẳng', () => {
  const [profile] = parseSftpPayload(
    JSON.stringify({ host: 'node.example.com', port: 2023, username: 'u.1', password: 'secret' }),
  );
  assert.equal(profile.host, 'node.example.com');
  assert.equal(profile.port, 2023);
  assert.equal(profile.username, 'u.1');
  assert.equal(profile.password, 'secret');
});

test('đọc JSON kiểu API Pterodactyl (attributes.sftp_details)', () => {
  const [profile] = parseSftpPayload(JSON.stringify(pterodactylPayload));
  assert.equal(profile.host, 'node1.example.com');
  assert.equal(profile.port, 2022);
  assert.equal(profile.username, 'user.abc123xy');
  assert.equal(profile.name, 'Minecraft Survival');
  assert.equal(profile.serverId, 'abc123xy');
});

test('đọc JSON lồng trong khoá sftp', () => {
  const [profile] = parseSftpPayload(JSON.stringify({ sftp: { host: 'h.example.com', username: 'u' } }));
  assert.equal(profile.host, 'h.example.com');
  assert.equal(profile.username, 'u');
});

test('đọc mảng nhiều máy chủ', () => {
  const profiles = parseSftpPayload(
    JSON.stringify([
      { host: 'a.example.com', username: 'ua' },
      { host: 'b.example.com', username: 'ub' },
    ]),
  );
  assert.equal(profiles.length, 2);
  assert.equal(profiles[1].host, 'b.example.com');
});

test('đọc mảng nằm trong khoá servers', () => {
  const profiles = parseSftpPayload(
    JSON.stringify({ servers: [{ host: 'a.example.com', username: 'ua' }] }),
  );
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].username, 'ua');
});

test('đọc chuỗi kết nối sftp://', () => {
  const [profile] = parseSftpPayload('sftp://user.abc123xy:mat%40khau@node4.example.com:2022/');
  assert.equal(profile.host, 'node4.example.com');
  assert.equal(profile.port, 2022);
  assert.equal(profile.username, 'user.abc123xy');
  assert.equal(profile.password, 'mat@khau');
});

test('đọc nội dung base64 của JSON', () => {
  const encoded = Buffer.from(JSON.stringify({ host: 'b64.example.com', username: 'u64' })).toString('base64');
  const [profile] = parseSftpPayload(encoded);
  assert.equal(profile.host, 'b64.example.com');
  assert.equal(profile.username, 'u64');
});

test('đọc nội dung URL-encoded', () => {
  const [profile] = parseSftpPayload(encodeURIComponent('{"host":"url.example.com","username":"u.url"}'));
  assert.equal(profile.host, 'url.example.com');
});

test('đọc các dòng key=value', () => {
  const [profile] = parseSftpPayload(
    'SFTP Host: node.example.com\nPort: 2024\nUsername: user.abc\nPassword: p@ss\nName: My Server',
  );
  assert.equal(profile.host, 'node.example.com');
  assert.equal(profile.port, 2024);
  assert.equal(profile.username, 'user.abc');
  assert.equal(profile.password, 'p@ss');
  assert.equal(profile.name, 'My Server');
});

test('đọc dạng gọn user@host:port', () => {
  const [profile] = parseSftpPayload('user.abc123xy@node.example.com:2022 matkhau');
  assert.equal(profile.username, 'user.abc123xy');
  assert.equal(profile.host, 'node.example.com');
  assert.equal(profile.port, 2022);
  assert.equal(profile.password, 'matkhau');
});

test('port mặc định khi thiếu', () => {
  const [profile] = parseSftpPayload(JSON.stringify({ host: 'h', username: 'u' }), { defaultPort: 2022 });
  assert.equal(profile.port, 2022);
});

test('chỉ nhận remotePath là đường dẫn tuyệt đối', () => {
  const [profile] = parseSftpPayload(JSON.stringify({ host: 'h', username: 'u', path: '/home/container/world' }));
  assert.equal(profile.remotePath, '/home/container/world');
  const [other] = parseSftpPayload(JSON.stringify({ host: 'h', username: 'u', path: 'relative/path' }));
  assert.equal(other.remotePath, undefined);
});

test('báo lỗi khi nội dung không hợp lệ', () => {
  assert.throws(() => parseSftpPayload('xin chào thế giới'), PayloadError);
  assert.throws(() => parseSftpPayload('   '), PayloadError);
});

test('báo lỗi khi JSON không có thông tin kết nối', () => {
  assert.throws(() => parseSftpPayload(JSON.stringify({ foo: 'bar' })), PayloadError);
});
