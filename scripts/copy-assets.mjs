import fs from 'node:fs/promises';
import path from 'node:path';

const target = path.join('media', 'jsQR.js');

const candidates = [
  'node_modules/jsqr/dist/jsQR.min.js',
  'node_modules/jsqr/dist/jsQR.js',
];

let copied = false;
for (const candidate of candidates) {
  try {
    await fs.access(candidate);
    await fs.mkdir('media', { recursive: true });
    await fs.copyFile(candidate, target);
    const { size } = await fs.stat(target);
    console.log(`[copy-assets] ${candidate} -> ${target} (${Math.round(size / 1024)} KB)`);
    copied = true;
    break;
  } catch {
    // try next candidate
  }
}

if (!copied) {
  console.error('[copy-assets] Không tìm thấy jsQR trong node_modules. Chạy "npm install" trước.');
  process.exit(1);
}
