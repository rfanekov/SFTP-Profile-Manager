import * as vscode from 'vscode';
import { COMMANDS } from '../constants';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface HomeProfile {
  name: string;
  host: string;
  username: string;
  port: number;
  status: ConnectionStatus;
  autoConnect: boolean;
  error?: string;
}

const icons = {
  qr: `<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><rect x="15" y="15" width="2" height="2" fill="currentColor" stroke="none"/><rect x="19" y="19" width="2" height="2" fill="currentColor" stroke="none"/><rect x="15" y="19" width="2" height="2" fill="currentColor" stroke="none"/><rect x="19" y="15" width="2" height="2" fill="currentColor" stroke="none"/>`,
  clipboard: `<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="M9 10.5h6M9 14h6M9 17.5h4"/>`,
  pencil: `<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/>`,
  server: `<rect x="3.5" y="4.5" width="17" height="6" rx="2"/><rect x="3.5" y="13.5" width="17" height="6" rx="2"/><circle cx="7" cy="7.5" r=".9" fill="currentColor" stroke="none"/><circle cx="7" cy="16.5" r=".9" fill="currentColor" stroke="none"/>`,
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function getHomeHtml(
  webview: vscode.Webview,
  nonce: string,
  profiles: HomeProfile[],
  options: { sharedPath?: string } = {},
): string {
  const data = JSON.stringify(profiles).replace(/</g, '\\u003c');
  const sharedPath = escapeHtml(options.sharedPath ?? 'đang tắt');
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pterodactyl SFTP</title>
<style nonce="${nonce}">
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 10px 12px 24px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: transparent;
  }
  .hero { margin: 2px 0 14px; }
  .hero h1 {
    display: flex; align-items: center; gap: 7px;
    margin: 0 0 2px; font-size: 1.02em; font-weight: 600;
  }
  .hero .logo { display: flex; flex: none; opacity: .85; }
  .hero .logo svg { width: 18px; height: 18px; display: block; }
  .hero p { margin: 0; font-size: .88em; opacity: .68; }
  .cards { display: flex; flex-direction: column; gap: 8px; }
  .card {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 9px 10px; border-radius: 6px; cursor: pointer; text-align: left;
    font: inherit; color: inherit;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.3));
    background: var(--vscode-editorWidget-background, rgba(128,128,128,.08));
    transition: background 90ms ease, border-color 90ms ease;
  }
  .card:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.18)); border-color: var(--vscode-focusBorder, rgba(128,128,128,.55)); }
  .card:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .card.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: transparent;
  }
  .card.primary:hover { background: var(--vscode-button-hoverBackground); }
  .card.primary .card-desc { opacity: .82; }
  .card-icon { flex: none; display: flex; width: 20px; height: 20px; }
  .card-icon svg { width: 20px; height: 20px; }
  .card-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
  .card-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-desc { font-size: .84em; opacity: .7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  h2 {
    margin: 20px 0 4px; font-size: .74em; font-weight: 600;
    text-transform: uppercase; letter-spacing: .07em; opacity: .6;
  }
  .profiles { display: flex; flex-direction: column; }
  .profile {
    display: flex; align-items: flex-start; gap: 6px; width: 100%;
    padding: 6px 8px; border: 0; border-radius: 5px;
    background: transparent; color: inherit; font: inherit;
    cursor: pointer; text-align: left;
  }
  .profile:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.18)); }
  .profile:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .profile-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .profile-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .profile-meta {
    font-family: var(--vscode-editor-font-family);
    font-size: .84em; opacity: .66;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .dot {
    flex: none; width: 8px; height: 8px; margin-top: 5px;
    border-radius: 50%;
    background: var(--vscode-disabledForeground, rgba(128,128,128,.6));
  }
  .dot.connected { background: var(--vscode-testing-iconPassed, #3fb950); }
  .dot.connecting { background: var(--vscode-progressBar-background, #d29922); }
  .dot.error { background: var(--vscode-errorForeground, #f85149); }
  .tag {
    font-size: .74em; text-transform: uppercase; letter-spacing: .04em; opacity: .55;
  }
  .profile-error {
    font-size: .8em; color: var(--vscode-errorForeground);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .chev { flex: none; opacity: .45; font-size: 1.1em; }
  .empty { margin: 2px 0 0; font-size: .88em; opacity: .62; line-height: 1.45; }
  .shared { display: flex; flex-direction: column; gap: 3px; margin-top: 14px; }
  .shared-label {
    font-size: .72em; font-weight: 600; text-transform: uppercase;
    letter-spacing: .07em; opacity: .55;
  }
  .shared-path {
    font-family: var(--vscode-editor-font-family); font-size: .82em; opacity: .7;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .link {
    align-self: flex-start; padding: 0; border: 0; background: transparent;
    color: var(--vscode-textLink-foreground); font: inherit; font-size: .84em; cursor: pointer;
  }
  .link:hover { text-decoration: underline; color: var(--vscode-textLink-activeForeground); }
  .link:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .hint {
    margin-top: 18px; padding-top: 12px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.24));
    font-size: .84em; opacity: .7; line-height: 1.55;
  }
  .hint p { margin: 0 0 6px; }
  .hint p:last-child { margin-bottom: 0; }
  kbd {
    font-family: var(--vscode-editor-font-family); font-size: .94em;
    padding: 0 4px; border-radius: 3px;
    border: 1px solid var(--vscode-keybindingLabel-border, rgba(128,128,128,.4));
    background: var(--vscode-keybindingLabel-background, rgba(128,128,128,.2));
  }
</style>
</head>
<body>
  <div class="hero">
    <h1>
      <span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><defs><mask id="logo-gap"><rect width="24" height="24" fill="#fff"/><g fill="#000" stroke="#000" stroke-width="1.6"><circle cx="16.1" cy="14.4" r="2.9"/><circle cx="12.6" cy="16.1" r="2.2"/><circle cx="19.3" cy="16.2" r="2.1"/><rect x="10.5" y="15.7" width="11.2" height="2.7" rx="1.35"/></g></mask></defs><g transform="translate(-0.4 -0.8)"><g mask="url(#logo-gap)"><circle cx="9.2" cy="10.9" r="3.6"/><circle cx="5.9" cy="13.4" r="2.5"/><rect x="3.6" y="13.5" width="10" height="2.8" rx="1.4"/></g><circle cx="16.1" cy="14.4" r="2.9"/><circle cx="12.6" cy="16.1" r="2.2"/><circle cx="19.3" cy="16.2" r="2.1"/><rect x="10.5" y="15.7" width="11.2" height="2.7" rx="1.35"/></g></svg></span>
      <span>LumineCloud SFTP</span>
    </h1>
    <p>Nhập cấu hình kết nối bằng mã QR</p>
  </div>

  <div class="cards">
    <button class="card primary" data-command="${COMMANDS.scanQr}">
      <span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons.qr}</svg></span>
      <span class="card-text">
        <span class="card-title">Quét mã QR</span>
        <span class="card-desc">Dán ảnh chụp màn hình hoặc dùng camera</span>
      </span>
    </button>

    <button class="card" data-command="${COMMANDS.fromClipboard}">
      <span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons.clipboard}</svg></span>
      <span class="card-text">
        <span class="card-title">Nhập từ clipboard</span>
        <span class="card-desc">JSON hoặc chuỗi sftp:// đã copy</span>
      </span>
    </button>

    <button class="card" data-command="${COMMANDS.manualInput}">
      <span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons.pencil}</svg></span>
      <span class="card-text">
        <span class="card-title">Nhập thủ công</span>
        <span class="card-desc">Gõ tay thông tin kết nối</span>
      </span>
    </button>

    <button class="card" data-command="${COMMANDS.manageProfiles}">
      <span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons.server}</svg></span>
      <span class="card-text">
        <span class="card-title">Quản lý hồ sơ</span>
        <span class="card-desc">Dùng lại, copy hoặc xoá hồ sơ</span>
      </span>
    </button>
  </div>

  <h2>Hồ sơ đã lưu</h2>
  <div id="profilesList" class="profiles"></div>
  <p id="profilesEmpty" class="empty" hidden>Chưa có hồ sơ nào. Quét mã QR lần đầu để tạo hồ sơ.</p>

  <div class="shared">
    <div class="shared-label">Hồ sơ chia sẻ</div>
    <div class="shared-path" title="${sharedPath}">${sharedPath}</div>
    <button class="link" data-command="${COMMANDS.openSharedFolder}">Mở thư mục hồ sơ chia sẻ</button>
  </div>

  <div class="hint">
    <p>Mẹo: <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> để chụp mã QR, rồi mở “Quét mã QR” và nhấn <kbd>Ctrl</kbd>+<kbd>V</kbd>.</p>
    <p>Mật khẩu không có trong mã QR của panel — extension sẽ hỏi khi nhập.</p>
  </div>

  <script type="application/json" id="profilesData" nonce="${nonce}">${data}</script>
  <script nonce="${nonce}">
    (function () {
      var vscode = acquireVsCodeApi();
      var listEl = document.getElementById('profilesList');
      var emptyEl = document.getElementById('profilesEmpty');

      document.querySelectorAll('[data-command]').forEach(function (element) {
        element.addEventListener('click', function () {
          vscode.postMessage({ type: 'command', command: element.getAttribute('data-command') });
        });
      });

      function render(profiles) {
        listEl.textContent = '';
        var items = Array.isArray(profiles) ? profiles : [];
        emptyEl.hidden = items.length > 0;
        items.forEach(function (profile) {
          var row = document.createElement('button');
          row.className = 'profile';
          if (profile.error) {
            row.title = profile.error;
          }

          var dot = document.createElement('span');
          dot.className = 'dot ' + (profile.status || 'idle');

          var main = document.createElement('span');
          main.className = 'profile-main';

          var name = document.createElement('span');
          name.className = 'profile-name';
          name.textContent = profile.name;

          var meta = document.createElement('span');
          meta.className = 'profile-meta';
          meta.textContent = profile.username + '@' + profile.host + ':' + profile.port;

          main.appendChild(name);
          main.appendChild(meta);

          if (profile.autoConnect === false) {
            var tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = 'không tự kết nối';
            main.appendChild(tag);
          }

          if (profile.error) {
            var errorLine = document.createElement('span');
            errorLine.className = 'profile-error';
            errorLine.textContent = profile.status === 'connecting' ? 'đang kết nối…' : profile.error;
            main.appendChild(errorLine);
          }

          var chev = document.createElement('span');
          chev.className = 'chev';
          chev.textContent = '\\u203a';

          row.appendChild(dot);
          row.appendChild(main);
          row.appendChild(chev);
          row.addEventListener('click', function () {
            vscode.postMessage({ type: 'profile', name: profile.name });
          });
          listEl.appendChild(row);
        });
      }

      var initial = [];
      try {
        initial = JSON.parse(document.getElementById('profilesData').textContent || '[]');
      } catch (error) {
        initial = [];
      }
      render(initial);

      window.addEventListener('message', function (event) {
        var message = event.data;
        if (message && message.type === 'profiles') {
          render(message.profiles);
        }
      });
    })();
  </script>
</body>
</html>`;
}
