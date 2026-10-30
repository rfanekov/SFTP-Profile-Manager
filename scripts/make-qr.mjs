#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import QRCode from 'qrcode';

const DEFAULT_PORT = 2022;
const DEFAULT_SIZE = 640;

const USAGE = `
Tạo mã QR chứa thông tin SFTP cho extension LumineCloud SFTP Manager.

Chạy tại thư mục gốc dự án, hoặc dùng "npm run qr -- <tham số>" từ bất kỳ đâu.
Nếu đang đứng trong thư mục scripts: node make-qr.mjs

Cách 1 — nhập từng trường:
  node scripts/make-qr.mjs --host node1.example.com --user user.a1b2c3d4 [--port 2022]
      [--pass "mat khau"] [--name "Minecraft Survival"] [--id a1b2c3d4]
      [--path /home/container] [--out qr.png] [--size 640]

Cách 2 — từ file có sẵn (JSON hoặc chuỗi sftp://):
  node scripts/make-qr.mjs du-lieu.json [--out qr.png]

Cách 3 — chạy không tham số để nhập tương tác:
  node scripts/make-qr.mjs

Định dạng nội dung QR:
  (mặc định)  JSON kiểu API Pterodactyl: {"attributes":{"sftp_details":{...}}}
  --flat      JSON phẳng: {"host":..,"port":..,"username":..,"password":..}
  --url       Chuỗi kết nối: sftp://user:pass@host:port
  --print     Chỉ in nội dung ra stdout, không tạo ảnh

Tuỳ chọn khác:
  --out <file>    Đường dẫn ảnh PNG (mặc định: sftp-<host>.png)
  --size <px>     Cạnh ảnh PNG (mặc định: ${DEFAULT_SIZE}, tối thiểu 128)
  -h, --help      Hiện trợ giúp
`.trim();

const FIELD_BY_FLAG = {
  host: 'host',
  port: 'port',
  user: 'username',
  username: 'username',
  pass: 'password',
  password: 'password',
  name: 'name',
  id: 'identifier',
  identifier: 'identifier',
  path: 'remotePath',
  remote: 'remotePath',
  out: 'out',
  size: 'size',
};

const BOOLEAN_FLAGS = new Set(['flat', 'url', 'print', 'help']);

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '-h') {
      options.help = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      if (options.input) {
        throw new Error(`Có nhiều hơn một file đầu vào: "${options.input}" và "${arg}"`);
      }
      options.input = arg;
      continue;
    }

    const body = arg.slice(2);
    const equalsAt = body.indexOf('=');
    const flag = equalsAt === -1 ? body : body.slice(0, equalsAt);

    if (BOOLEAN_FLAGS.has(flag)) {
      options[flag] = true;
      continue;
    }

    const field = FIELD_BY_FLAG[flag];
    if (!field) {
      throw new Error(`Tham số không hợp lệ: --${flag}. Chạy --help để xem cách dùng.`);
    }

    const value = equalsAt === -1 ? argv[++index] : body.slice(equalsAt + 1);
    if (value === undefined) {
      throw new Error(`Thiếu giá trị cho --${flag}`);
    }
    options[field] = value;
  }

  return options;
}

function normalizeHost(raw) {
  return raw
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^\[(.*)]$/, '$1');
}

function normalizePort(raw) {
  const port = Number.parseInt(String(raw ?? DEFAULT_PORT), 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Port không hợp lệ: "${raw}". Cần số từ 1 đến 65535.`);
  }
  return port;
}

function validate(profile) {
  if (!profile.host) {
    throw new Error('Thiếu host SFTP (--host).');
  }
  if (/\s/.test(profile.host)) {
    throw new Error(`Host không được chứa khoảng trắng: "${profile.host}"`);
  }
  if (!profile.username) {
    throw new Error('Thiếu username SFTP (--user).');
  }
  if (/\s/.test(profile.username)) {
    throw new Error(`Username không được chứa khoảng trắng: "${profile.username}"`);
  }
}

function buildPayload(profile, format) {
  const attributes = {};

  if (profile.name) {
    attributes.name = profile.name;
  }
  if (profile.identifier) {
    attributes.identifier = profile.identifier;
  }

  if (format === 'url') {
    const user = encodeURIComponent(profile.username);
    const auth = profile.password ? `${user}:${encodeURIComponent(profile.password)}` : user;
    const host = profile.host.includes(':') ? `[${profile.host}]` : profile.host;
    const suffix = profile.remotePath && profile.remotePath !== '/' ? profile.remotePath : '';
    return `sftp://${auth}@${host}:${profile.port}${suffix}`;
  }

  if (format === 'flat') {
    const flat = { name: profile.name || profile.host, host: profile.host, port: profile.port, username: profile.username };
    if (profile.password) {
      flat.password = profile.password;
    }
    if (profile.remotePath) {
      flat.remotePath = profile.remotePath;
    }
    return JSON.stringify(flat);
  }

  attributes.sftp_details = { ip: profile.host, port: profile.port, username: profile.username };
  if (profile.password) {
    attributes.sftp_details.password = profile.password;
  }
  if (profile.remotePath) {
    attributes.remotePath = profile.remotePath;
  }
  return JSON.stringify({ attributes });
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'sftp';
}

async function readInputFile(file) {
  const raw = await fs.readFile(file, 'utf8');
  const text = raw.trim();
  if (!text) {
    throw new Error(`File rỗng: ${file}`);
  }
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

function askHidden(question) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return Promise.resolve('');
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';

    const finish = (result) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      resolve(result);
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          finish(value);
          return;
        }
        if (char === '\u0003') {
          finish('');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (char >= ' ') {
          value += char;
          process.stdout.write('*');
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function promptInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question, { required = false, fallback = '' } = {}) => {
    for (;;) {
      const answer = (await rl.question(question)).trim();
      if (answer) {
        return answer;
      }
      if (!required) {
        return fallback;
      }
      process.stdout.write('  → Không được để trống, nhập lại.\n');
    }
  };

  try {
    const host = await ask('Host SFTP (vd: node1.example.com): ', { required: true });
    const port = await ask(`Port [${DEFAULT_PORT}]: `, { fallback: String(DEFAULT_PORT) });
    const username = await ask('Username SFTP (vd: user.a1b2c3d4): ', { required: true });
    const name = await ask('Tên máy chủ (tùy chọn): ');
    const identifier = await ask('Identifier/short ID (tùy chọn): ');
    const remotePath = await ask('Đường dẫn từ xa (tùy chọn, vd: /home/container): ');
    const password = await askHidden('Mật khẩu (tùy chọn, không hiện khi gõ): ');
    return { host, port, username, name, identifier, remotePath, password };
  } finally {
    rl.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(USAGE);
    return;
  }

  const format = options.url ? 'url' : options.flat ? 'flat' : 'pterodactyl';
  let payload;

  if (options.input) {
    payload = await readInputFile(options.input);
  } else if (!options.host && !options.username) {
    if (!process.stdin.isTTY) {
      console.log(USAGE);
      return;
    }
    const answers = await promptInteractive();
    const profile = {
      host: normalizeHost(answers.host),
      port: normalizePort(answers.port),
      username: answers.username.trim(),
      name: answers.name || '',
      identifier: answers.identifier || '',
      remotePath: answers.remotePath || '',
      password: answers.password || '',
    };
    validate(profile);
    payload = buildPayload(profile, format);
  } else {
    const profile = {
      host: normalizeHost(options.host ?? ''),
      port: normalizePort(options.port),
      username: String(options.username ?? '').trim(),
      name: options.name ?? '',
      identifier: options.identifier ?? '',
      remotePath: options.remotePath ?? '',
      password: options.password ?? '',
    };
    validate(profile);
    payload = buildPayload(profile, format);
  }

  if (options.print) {
    process.stdout.write(`${payload}\n`);
    return;
  }

  const defaultName = options.input
    ? path.basename(options.input).replace(/\.[^.]+$/, '') + '.png'
    : `sftp-${slug(normalizeHost(options.host ?? 'qr'))}.png`;
  const outFile = path.resolve(options.out ?? defaultName);
  const size = Math.min(2048, Math.max(128, Number.parseInt(options.size ?? DEFAULT_SIZE, 10) || DEFAULT_SIZE));

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  try {
    await QRCode.toFile(outFile, payload, { errorCorrectionLevel: 'M', margin: 4, width: size });
  } catch (error) {
    throw new Error(`Không tạo được QR (${error.message}). Thử giảm bớt nội dung hoặc dùng --flat.`);
  }

  console.log(`Đã tạo: ${path.relative(process.cwd(), outFile) || outFile} (${size}x${size})`);
  console.log(`Nội dung (${payload.length} ký tự):`);
  console.log(`  ${payload}`);
  console.log('');
  console.log('Dùng: mở bảng LumineCloud SFTP → "Quét mã QR" → kéo-thả file ảnh này vào khung.');
}

main().catch((error) => {
  console.error(`Lỗi: ${error.message}`);
  process.exit(1);
});
