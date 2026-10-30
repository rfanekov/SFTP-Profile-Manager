import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { Server, utils } from 'ssh2';
import { RemoteClient } from '../sftp/client';

const STATUS = { OK: 0, EOF: 1, NO_SUCH_FILE: 2, FAILURE: 4 };
const MODE_FILE = 0o100644;
const MODE_DIR = 0o040755;

interface FakeEntry {
  type: 'file' | 'directory';
  data: Buffer;
  mtime: number;
}

function createFileSystem(): Map<string, FakeEntry> {
  const now = 1700000000;
  return new Map<string, FakeEntry>([
    ['/', { type: 'directory', data: Buffer.alloc(0), mtime: now }],
    ['/hello.txt', { type: 'file', data: Buffer.from('xin chào thế giới'), mtime: now }],
    ['/config', { type: 'directory', data: Buffer.alloc(0), mtime: now }],
    ['/config/server.cfg', { type: 'file', data: Buffer.from('motd=hi'), mtime: now }],
  ]);
}

function attrsFor(entry: FakeEntry) {
  const isDir = entry.type === 'directory';
  return {
    mode: isDir ? MODE_DIR : MODE_FILE,
    uid: 1000,
    gid: 1000,
    size: isDir ? 4096 : entry.data.length,
    atime: entry.mtime,
    mtime: entry.mtime,
  };
}

function longnameFor(entry: FakeEntry, name: string): string {
  const isDir = entry.type === 'directory';
  const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
  const size = String(isDir ? 4096 : entry.data.length).padStart(8);
  return `${perms}    1 1000     1000     ${size} Jan  1 00:00 ${name}`;
}

const OPEN_FLAG_WRITE = 0x00000002;
const OPEN_FLAG_TRUNCATE = 0x00000010;

function wantsWrite(flags: string | number): boolean {
  if (typeof flags === 'number') {
    return (flags & OPEN_FLAG_WRITE) !== 0 || (flags & OPEN_FLAG_TRUNCATE) !== 0;
  }
  return /[wa+]/.test(flags);
}

function startSftpServer(files: Map<string, FakeEntry>): Promise<{ port: number; stop: () => Promise<void> }> {
  const hostKey = utils.generateKeyPairSync('ed25519').private;
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'demo' && ctx.password === 'secret') {
        ctx.accept();
      } else {
        ctx.reject(['password']);
      }
    });

    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('sftp', (acceptSftp) => {
          const sftp = acceptSftp();
          const handles = new Map<string, { path: string; index: number }>();
          let counter = 0;

          const addHandle = (path: string): Buffer => {
            const id = `h${++counter}`;
            handles.set(id, { path, index: 0 });
            return Buffer.from(id);
          };
          const lookup = (handle: Buffer) => handles.get(handle.toString());
          const now = () => Math.floor(Date.now() / 1000);

          sftp.on('OPEN', (reqid, filename, flags) => {
            let entry = files.get(filename);
            if (!entry) {
              if (!wantsWrite(flags)) {
                sftp.status(reqid, STATUS.NO_SUCH_FILE);
                return;
              }
              entry = { type: 'file', data: Buffer.alloc(0), mtime: now() };
              files.set(filename, entry);
            }
            sftp.handle(reqid, addHandle(filename));
          });

          sftp.on('READ', (reqid, handle, offset, length) => {
            const target = lookup(handle);
            const entry = target && files.get(target.path);
            if (!entry) {
              sftp.status(reqid, STATUS.FAILURE);
              return;
            }
            const chunk = entry.data.subarray(offset, offset + length);
            if (chunk.length === 0) {
              sftp.status(reqid, STATUS.EOF);
            } else {
              sftp.data(reqid, chunk);
            }
          });

          sftp.on('WRITE', (reqid, handle, offset, data) => {
            const target = lookup(handle);
            const entry = target && files.get(target.path);
            if (!entry) {
              sftp.status(reqid, STATUS.FAILURE);
              return;
            }
            const end = offset + data.length;
            if (entry.data.length < end) {
              const grown = Buffer.alloc(end);
              entry.data.copy(grown);
              entry.data = grown;
            }
            data.copy(entry.data, offset);
            sftp.status(reqid, STATUS.OK);
          });

          sftp.on('FSTAT', (reqid, handle) => {
            const target = lookup(handle);
            const entry = target && files.get(target.path);
            if (!entry) {
              sftp.status(reqid, STATUS.NO_SUCH_FILE);
              return;
            }
            sftp.attrs(reqid, attrsFor(entry));
          });

          const statPath = (reqid: number, path: string) => {
            const entry = files.get(path);
            if (!entry) {
              sftp.status(reqid, STATUS.NO_SUCH_FILE);
              return;
            }
            sftp.attrs(reqid, attrsFor(entry));
          };
          sftp.on('STAT', statPath);
          sftp.on('LSTAT', statPath);

          sftp.on('OPENDIR', (reqid, path) => {
            const entry = files.get(path);
            if (!entry || entry.type !== 'directory') {
              sftp.status(reqid, STATUS.NO_SUCH_FILE);
              return;
            }
            sftp.handle(reqid, addHandle(path));
          });

          sftp.on('READDIR', (reqid, handle) => {
            const target = lookup(handle);
            if (!target) {
              sftp.status(reqid, STATUS.FAILURE);
              return;
            }
            if (target.index > 0) {
              sftp.status(reqid, STATUS.EOF);
              return;
            }
            target.index = 1;
            const prefix = target.path === '/' ? '/' : `${target.path}/`;
            const names = [...files.entries()]
              .filter(
                ([path]) =>
                  path !== target.path && path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
              )
              .map(([path, entry]) => {
                const name = path.slice(prefix.length);
                return { filename: name, longname: longnameFor(entry, name), attrs: attrsFor(entry) };
              });
            sftp.name(reqid, names);
          });

          sftp.on('CLOSE', (reqid, handle) => {
            handles.delete(handle.toString());
            sftp.status(reqid, STATUS.OK);
          });

          sftp.on('REALPATH', (reqid, path) => {
            const resolved = !path ? '/' : path;
            sftp.name(reqid, [
              {
                filename: resolved,
                longname: resolved,
                attrs: attrsFor({ type: 'directory', data: Buffer.alloc(0), mtime: now() }),
              },
            ]);
          });

          sftp.on('MKDIR', (reqid, path) => {
            files.set(path, { type: 'directory', data: Buffer.alloc(0), mtime: now() });
            sftp.status(reqid, STATUS.OK);
          });
          sftp.on('RMDIR', (reqid, path) => {
            for (const key of [...files.keys()]) {
              if (key === path || key.startsWith(`${path}/`)) {
                files.delete(key);
              }
            }
            sftp.status(reqid, STATUS.OK);
          });
          sftp.on('REMOVE', (reqid, path) => {
            files.delete(path);
            sftp.status(reqid, STATUS.OK);
          });
          sftp.on('RENAME', (reqid, from, to) => {
            const entry = files.get(from);
            if (entry) {
              files.delete(from);
              files.set(to, entry);
            }
            sftp.status(reqid, STATUS.OK);
          });
          sftp.on('SETSTAT', (reqid) => sftp.status(reqid, STATUS.OK));
          sftp.on('FSETSTAT', (reqid) => sftp.status(reqid, STATUS.OK));
        });
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        stop: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

test('kết nối thật: liệt kê, đọc, ghi, mkdir, rename, xoá', { timeout: 30000 }, async () => {
  const files = createFileSystem();
  const server = await startSftpServer(files);
  const client = new RemoteClient();

  try {
    await client.connect({ host: '127.0.0.1', port: server.port, username: 'demo', password: 'secret' });

    const root = await client.list('/');
    assert.deepEqual(root.map((entry) => entry.name).sort(), ['config', 'hello.txt']);
    assert.equal(root.find((entry) => entry.name === 'config')?.type, 'directory');
    assert.equal(root.find((entry) => entry.name === 'hello.txt')?.type, 'file');

    assert.equal((await client.readFile('/hello.txt')).toString('utf8'), 'xin chào thế giới');
    assert.equal((await client.stat('/config')).type, 'directory');
    assert.equal((await client.list('/config')).map((entry) => entry.name).join(), 'server.cfg');

    await client.writeFile('/new.txt', Buffer.from('noi dung moi'));
    assert.equal(files.get('/new.txt')?.data.toString('utf8'), 'noi dung moi');

    await client.mkdir('/logs');
    assert.equal(files.get('/logs')?.type, 'directory');

    await client.rename('/new.txt', '/renamed.txt');
    assert.ok(files.has('/renamed.txt'));
    assert.ok(!files.has('/new.txt'));

    await client.remove('/renamed.txt', false, false);
    assert.ok(!files.has('/renamed.txt'));
  } finally {
    await client.end();
    await server.stop();
  }
});

test('sai mật khẩu bị máy chủ từ chối', { timeout: 30000 }, async () => {
  const server = await startSftpServer(createFileSystem());
  const client = new RemoteClient();

  try {
    await assert.rejects(() =>
      client.connect({ host: '127.0.0.1', port: server.port, username: 'demo', password: 'sai' }),
    );
  } finally {
    await client.end();
    await server.stop();
  }
});
