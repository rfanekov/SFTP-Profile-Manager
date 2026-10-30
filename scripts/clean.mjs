import fs from 'node:fs';

fs.rmSync('out', { recursive: true, force: true });
console.log('[clean] đã xoá out/');
