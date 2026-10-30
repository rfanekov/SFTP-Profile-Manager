import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseSftpPayload } from '../parse/parsePayload';

const scriptPath = path.join(__dirname, '../../scripts/make-qr.mjs');

function run(args: string[]): string {
  return execFileSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'luminecloud-qr-'));
}

test('script tạo PNG hợp lệ và payload đọc được', () => {
  const dir = makeTempDir();
  const out = path.join(dir, 'qr.png');
  const stdout = run(['--host', 'https://node9.example.com/', '--user', 'user.ab12', '--pass', 'mật khẩu', '--name', 'Máy chủ Thử', '--out', out]);

  const buffer = fs.readFileSync(out);
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, 'phải là PNG');
  assert.equal(buffer.readUInt32BE(16), 640, 'ảnh mặc định 640px');

  const payloadLine = stdout.split(/\r?\n/).find((line) => line.trimStart().startsWith('{"attributes"'));
  assert.ok(payloadLine, 'phải in payload ra màn hình');

  const [profile] = parseSftpPayload(payloadLine.trim());
  assert.equal(profile.host, 'node9.example.com');
  assert.equal(profile.username, 'user.ab12');
  assert.equal(profile.password, 'mật khẩu');
  assert.equal(profile.name, 'Máy chủ Thử');
});

test('--flat in JSON phẳng đọc được', () => {
  const payload = run(['--host', 'n1.example.com', '--user', 'u1', '--port', '2023', '--flat', '--print']).trim();
  const [profile] = parseSftpPayload(payload);
  assert.equal(profile.host, 'n1.example.com');
  assert.equal(profile.username, 'u1');
  assert.equal(profile.port, 2023);
});

test('--url in chuỗi kết nối đọc được', () => {
  const payload = run(['--host', 'n2.example.com', '--user', 'u2', '--pass', 'a b@c', '--url', '--print']).trim();
  assert.ok(payload.startsWith('sftp://'), payload);
  const [profile] = parseSftpPayload(payload);
  assert.equal(profile.host, 'n2.example.com');
  assert.equal(profile.password, 'a b@c');
});

test('đọc được file JSON đầu vào', () => {
  const stdout = run(['samples/qr-mau.json', '--print']);
  const [profile] = parseSftpPayload(stdout.trim());
  assert.equal(profile.host, 'node1.example.com');
  assert.equal(profile.username, 'user.a1b2c3d4');
});

test('báo lỗi rõ ràng khi thiếu tham số', () => {
  assert.throws(
    () => run(['--user', 'u1']),
    (error: { status?: number; stderr?: string }) => {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr), /Thiếu host SFTP/);
      return true;
    },
  );
});
