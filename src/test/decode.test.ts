import assert from 'node:assert/strict';
import test from 'node:test';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { parseSftpPayload } from '../parse/parsePayload';

function renderQr(text: string, scale = 6, quietZone = 4): { rgba: Uint8ClampedArray; size: number } {
  const created = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const moduleCount = created.modules.size;
  const data = created.modules.data;
  const size = (moduleCount + quietZone * 2) * scale;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let y = 0; y < moduleCount; y++) {
    for (let x = 0; x < moduleCount; x++) {
      if (!data[y * moduleCount + x]) {
        continue;
      }
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (quietZone + x) * scale + dx;
          const py = (quietZone + y) * scale + dy;
          const offset = (py * size + px) * 4;
          rgba[offset] = 0;
          rgba[offset + 1] = 0;
          rgba[offset + 2] = 0;
        }
      }
    }
  }

  return { rgba, size };
}

test('giải mã QR chứa JSON Pterodactyl rồi phân tích', () => {
  const payload = JSON.stringify({
    attributes: {
      name: 'Bedrock SMP',
      identifier: 'srv123',
      sftp_details: { ip: 'node7.example.com', port: 2022, username: 'user.srv123' },
    },
  });

  const { rgba, size } = renderQr(payload);
  const decoded = jsQR(rgba, size, size, { inversionAttempts: 'attemptBoth' });

  assert.ok(decoded, 'jsQR phải đọc được ảnh QR vừa tạo');
  assert.equal(decoded.data, payload);

  const [profile] = parseSftpPayload(decoded.data);
  assert.equal(profile.host, 'node7.example.com');
  assert.equal(profile.username, 'user.srv123');
  assert.equal(profile.port, 2022);
});

test('giải mã QR chứa chuỗi sftp:// rồi phân tích', () => {
  const payload = 'sftp://user.srv9:p%40ss@node9.example.com:2022';
  const { rgba, size } = renderQr(payload);
  const decoded = jsQR(rgba, size, size);

  assert.ok(decoded);
  const [profile] = parseSftpPayload(decoded.data);
  assert.equal(profile.host, 'node9.example.com');
  assert.equal(profile.username, 'user.srv9');
  assert.equal(profile.password, 'p@ss');
});
