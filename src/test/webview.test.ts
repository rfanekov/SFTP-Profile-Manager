import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import type * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { getHomeHtml } from '../webview/homeHtml';

type WebviewModule = typeof import('../webview/scannerHtml');

const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = loader._load;

loader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
  if (request === 'vscode') {
    return {
      Uri: {
        joinPath: (_base: unknown, ...segments: string[]) => ({ toString: () => segments.join('/') }),
      },
    };
  }
  return originalLoad.call(Module, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getScannerHtml } = require('../webview/scannerHtml') as WebviewModule;
loader._load = originalLoad;

const fakeWebview = {
  cspSource: 'vscode-resource:',
  asWebviewUri: (uri: unknown) => uri,
} as unknown as vscode.Webview;

test('HTML webview nhúng jsQR và nonce đúng', () => {
  const html = getScannerHtml(fakeWebview, {} as vscode.Uri, 'NONCE123');
  assert.match(html, /<script nonce="NONCE123" src="[^"]*jsQR\.js"><\/script>/);
  assert.match(html, /script-src 'nonce-NONCE123'/);
  assert.doesNotMatch(html, /style="/);
});

test('script nội tuyến của webview không lỗi cú pháp', () => {
  const html = getScannerHtml(fakeWebview, {} as vscode.Uri, 'abc');
  const inline = [...html.matchAll(/<script nonce="[^"]*">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(inline.length, 1);
  assert.doesNotThrow(() => new vm.Script(inline[0], { filename: 'webview-inline.js' }));
});

test('các phần tử mà script tham chiếu đều tồn tại trong HTML', () => {
  const html = getScannerHtml(fakeWebview, {} as vscode.Uri, 'abc');
  for (const id of ['dropzone', 'file', 'browse', 'camera', 'pasteBtn', 'status', 'result', 'resultText', 'video', 'canvas']) {
    assert.match(html, new RegExp(`id="${id}"`), `thiếu phần tử #${id}`);
  }
});

test('home view hiển thị đủ chức năng và danh sách hồ sơ', () => {
  const html = getHomeHtml(
    { cspSource: 'cdn' } as vscode.Webview,
    'n1',
    [{ name: 'Minecraft Survival', host: 'node1.example.com', username: 'user.abc', port: 2022, status: 'connected', autoConnect: true }],
  );

  for (const command of [COMMANDS.scanQr, COMMANDS.fromClipboard, COMMANDS.manualInput, COMMANDS.manageProfiles]) {
    assert.match(html, new RegExp(`data-command="${command}"`), `thiếu nút ${command}`);
  }
  assert.match(html, /LumineCloud SFTP/);
  assert.match(html, /"name":"Minecraft Survival"/);
  assert.match(html, /id="profilesEmpty"/);
  assert.match(html, /id="profilesList"/);
  assert.doesNotMatch(html, /style="/);
  assert.doesNotMatch(html, /onclick=/);
});

test('script của home view không lỗi cú pháp', () => {
  const html = getHomeHtml({ cspSource: 'cdn' } as vscode.Webview, 'n2', []);
  const inline = [...html.matchAll(/<script nonce="[^"]*">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(inline.length, 1);
  assert.doesNotThrow(() => new vm.Script(inline[0], { filename: 'home-inline.js' }));
});

test('home view không nhúng mật khẩu vào HTML', () => {
  const html = getHomeHtml(
    { cspSource: 'cdn' } as vscode.Webview,
    'n3',
    [{ name: 'A', host: 'h', username: 'u', port: 2022, status: 'idle', autoConnect: true }],
  );
  assert.doesNotMatch(html, /password/i);
});
