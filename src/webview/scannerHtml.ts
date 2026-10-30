import * as vscode from 'vscode';

export function getScannerHtml(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string): string {
  const jsQrUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'jsQR.js'));
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; media-src ${webview.cspSource} blob:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quét mã QR SFTP</title>
<style nonce="${nonce}">
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 28px 20px 48px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.35em; font-weight: 600; margin: 0 0 6px; }
  .sub { margin: 0 0 22px; opacity: 0.75; }
  .drop {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; min-height: 200px; padding: 24px; text-align: center; cursor: pointer;
    border: 1px dashed var(--vscode-panel-border, rgba(128,128,128,0.45));
    border-radius: 8px;
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.06));
    transition: border-color 120ms ease, background 120ms ease;
  }
  .drop:hover, .drop.over {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.12));
  }
  .drop-icon { font-size: 30px; line-height: 1; opacity: 0.65; }
  .drop-title { font-weight: 600; }
  .drop-hint { opacity: 0.7; font-size: 0.92em; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .btn {
    padding: 6px 12px; border-radius: 4px; cursor: pointer;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    font-family: inherit; font-size: inherit;
  }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.3)); }
  .btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn.primary:hover { background: var(--vscode-button-hoverBackground); }
  .status { margin-top: 16px; min-height: 1.4em; }
  .status.err { color: var(--vscode-errorForeground); }
  .status.ok { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); }
  .result {
    margin-top: 16px; padding: 12px; border-radius: 6px;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
    background: var(--vscode-editorWidget-background, transparent);
  }
  .result-label { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.65; margin-bottom: 6px; }
  .result pre { margin: 0; white-space: pre-wrap; word-break: break-all; font-family: var(--vscode-editor-font-family); }
  video { display: none; width: 100%; max-width: 420px; margin-top: 16px; border-radius: 6px; background: #000; }
  video.on { display: block; }
  .formats { margin-top: 26px; opacity: 0.85; }
  .formats summary { cursor: pointer; }
  .formats ul { margin: 10px 0 0; padding-left: 20px; }
  .formats li { margin-bottom: 6px; }
  code {
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
    padding: 1px 5px; border-radius: 3px; font-size: 0.92em;
  }
  canvas, #file { display: none; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Nhập SFTP Pterodactyl từ mã QR</h1>
    <p class="sub">Dán ảnh chụp màn hình bằng Ctrl+V, kéo-thả ảnh vào khung, hoặc chọn file. Ảnh được xử lý locally, không gửi đi đâu.</p>

    <div id="dropzone" class="drop" tabindex="0" role="button" aria-label="Chọn hoặc thả ảnh chứa mã QR">
      <div class="drop-icon">▣</div>
      <div class="drop-title">Thả ảnh chứa mã QR vào đây</div>
      <div class="drop-hint">Ctrl+V để dán từ clipboard · Enter để chọn file</div>
    </div>

    <div class="row">
      <button id="browse" class="btn primary">Chọn ảnh…</button>
      <button id="camera" class="btn">Dùng camera</button>
      <button id="pasteBtn" class="btn">Dán từ clipboard</button>
    </div>

    <div id="status" class="status"></div>
    <div id="result" class="result" hidden>
      <div class="result-label">Nội dung quét được</div>
      <pre id="resultText"></pre>
    </div>

    <video id="video" playsinline muted></video>
    <canvas id="canvas"></canvas>
    <input id="file" type="file" accept="image/*" />

    <details class="formats">
      <summary>Định dạng QR được hỗ trợ</summary>
      <ul>
        <li>JSON phẳng: <code>{"host":"node.example.com","port":2022,"username":"user.abc123","password":"..."}</code></li>
        <li>JSON kiểu API panel: <code>{"attributes":{"name":"Minecraft","sftp_details":{"ip":"node.example.com","port":2022,"username":"user.abc123"}}}</code></li>
        <li>Chuỗi kết nối: <code>sftp://user.abc123:matkhau@node.example.com:2022</code></li>
        <li>Dạng gọn: <code>user.abc123@node.example.com:2022 matkhau</code></li>
        <li>Nhiều dòng <code>key=value</code> hoặc <code>key: value</code></li>
        <li>JSON được mã hoá base64 / URL-encoded</li>
      </ul>
    </details>
  </div>

<script nonce="${nonce}" src="${jsQrUri}"></script>
<script nonce="${nonce}">
(function () {
  var vscode = acquireVsCodeApi();
  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('file');
  var browseBtn = document.getElementById('browse');
  var cameraBtn = document.getElementById('camera');
  var pasteBtn = document.getElementById('pasteBtn');
  var statusEl = document.getElementById('status');
  var resultEl = document.getElementById('result');
  var resultText = document.getElementById('resultText');
  var video = document.getElementById('video');
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var stream = null;
  var scanTimer = null;
  var finished = false;

  function setStatus(message, kind) {
    statusEl.textContent = message || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function fail(message) {
    setStatus(message, 'err');
  }

  function success(text) {
    if (finished) { return; }
    finished = true;
    stopCamera();
    resultEl.hidden = false;
    resultText.textContent = text;
    setStatus('Đã đọc mã QR, đang xử lý…', 'ok');
    vscode.postMessage({ type: 'decoded', text: text });
  }

  async function toBitmap(source) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(source);
      } catch (error) {
        // rơi xuống dùng thẻ img
      }
    }
    var url = URL.createObjectURL(source);
    try {
      return await new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('ảnh không hợp lệ')); };
        img.src = url;
      });
    } finally {
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }
  }

  function imageSize(source) {
    var w = source.videoWidth || source.naturalWidth || source.width || 0;
    var h = source.videoHeight || source.naturalHeight || source.height || 0;
    return { w: w, h: h };
  }

  function scanAt(source, scale) {
    var size = imageSize(source);
    var w = Math.max(1, Math.round(size.w * scale));
    var h = Math.max(1, Math.round(size.h * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    var image = ctx.getImageData(0, 0, w, h);
    return jsQR(image.data, w, h, { inversionAttempts: 'attemptBoth' });
  }

  function decodeBitmap(bitmap) {
    var size = imageSize(bitmap);
    var maxSide = Math.max(size.w, size.h);
    if (!maxSide) {
      return null;
    }
    var base = maxSide > 2000 ? 2000 / maxSide : 1;
    var scales = [base];
    if (maxSide < 900) {
      scales.push(Math.min(3, 900 / maxSide));
    }
    for (var i = 0; i < scales.length; i++) {
      var found = scanAt(bitmap, Math.max(0.05, scales[i]));
      if (found && found.data) {
        return found.data;
      }
    }
    return null;
  }

  async function handleFile(file) {
    if (!file) {
      return;
    }
    if (!/^image\\//.test(file.type)) {
      fail('File không phải ảnh. Hãy chọn ảnh chụp màn hình (.png, .jpg…).');
      return;
    }
    setStatus('Đang quét ảnh…');
    try {
      var bitmap = await toBitmap(file);
      var text = decodeBitmap(bitmap);
      if (text) {
        success(text);
      } else {
        fail('Không tìm thấy mã QR trong ảnh. Thử chụp lại rõ hơn, đủ sáng và không nghiêng.');
      }
    } catch (error) {
      fail('Không đọc được ảnh: ' + (error && error.message ? error.message : error));
    }
  }

  function looksLikePayload(text) {
    return /^sftp:\\/\\//i.test(text) || text.indexOf('{') !== -1 || text.indexOf('=') !== -1 || /@[^@\\s]+:\\d+/.test(text);
  }

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  browseBtn.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    handleFile(fileInput.files && fileInput.files[0]);
    fileInput.value = '';
  });

  document.addEventListener('dragover', function (event) {
    event.preventDefault();
    dropzone.classList.add('over');
  });
  document.addEventListener('dragleave', function () { dropzone.classList.remove('over'); });
  document.addEventListener('drop', function (event) {
    event.preventDefault();
    dropzone.classList.remove('over');
    var files = event.dataTransfer && event.dataTransfer.files;
    if (files && files.length) {
      handleFile(files[0]);
    }
  });

  window.addEventListener('paste', function (event) {
    var items = (event.clipboardData && event.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        event.preventDefault();
        handleFile(items[i].getAsFile());
        return;
      }
    }
    var text = event.clipboardData && event.clipboardData.getData('text');
    if (text && looksLikePayload(text)) {
      event.preventDefault();
      success(text.trim());
    }
  });

  pasteBtn.addEventListener('click', async function () {
    try {
      var items = await navigator.clipboard.read();
      for (var i = 0; i < items.length; i++) {
        var types = items[i].types || [];
        for (var j = 0; j < types.length; j++) {
          if (types[j].indexOf('image/') === 0) {
            var blob = await items[i].getType(types[j]);
            handleFile(new File([blob], 'clipboard.png', { type: types[j] }));
            return;
          }
        }
      }
      setStatus('Clipboard không có ảnh. Hãy thử nhấn Ctrl+V khi cửa sổ này đang được chọn.', 'err');
    } catch (error) {
      setStatus('Không truy cập được clipboard. Hãy nhấn Ctrl+V khi cửa sổ này đang được chọn.', 'err');
    }
  });

  function stopCamera() {
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
      video.classList.remove('on');
    }
  }

  cameraBtn.addEventListener('click', async function () {
    if (stream) {
      stopCamera();
      setStatus('');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fail('Môi trường này không hỗ trợ camera. Hãy dùng ảnh chụp màn hình và dán bằng Ctrl+V.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
      video.classList.add('on');
      await video.play();
      setStatus('Đưa mã QR vào khung hình…');
      scanTimer = setInterval(function () {
        if (video.readyState < 2 || !video.videoWidth) {
          return;
        }
        var text = decodeBitmap(video);
        if (text) {
          success(text);
        }
      }, 200);
    } catch (error) {
      stopCamera();
      fail('Không mở được camera (' + (error && error.message ? error.message : error) + '). Dùng ảnh chụp màn hình + Ctrl+V thay thế.');
    }
  });

  window.addEventListener('focus', function () { dropzone.focus(); });
})();
</script>
</body>
</html>`;
}
