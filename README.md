# LumineCloud SFTP Manager

Quét mã QR để nhập thông tin SFTP của máy chủ Pterodactyl, lưu thành **hồ sơ trong VS Code** và **tự động kết nối** — thư mục máy chủ hiện ngay trong Explorer để mở, sửa, lưu trực tiếp.

Không ghi `.vscode/sftp.json`, không sửa `~/.ssh/config`, không cần extension SFTP của bên thứ ba.

## Bảng điều khiển trong Activity Bar

Sau khi cài, icon 2 đám mây nằm ở thanh bên trái (cùng chỗ Explorer / Search). Bấm vào để mở bảng **LumineCloud SFTP**:

- **Quét mã QR** — mở cửa sổ quét ảnh.
- **Nhập từ clipboard** — dùng JSON/chuỗi `sftp://` đã copy.
- **Nhập thủ công** — gõ tay thông tin.
- **Quản lý hồ sơ** — mở nhanh danh sách hồ sơ.

Danh sách **Hồ sơ đã lưu** hiển thị chấm trạng thái:

| Chấm | Nghĩa |
| --- | --- |
| xanh | đang kết nối |
| vàng | đang kết nối… |
| xám | chưa kết nối |
| đỏ | lỗi (rê chuột để xem lý do) |

Bấm vào một hồ sơ để **Kết nối / Ngắt kết nối**, **Bật/Tắt tự động kết nối**, **Copy chuỗi kết nối** hoặc **Xoá**.

## Kết nối hoạt động thế nào

- Extension có SFTP client riêng, hồ sơ được lưu trong **SecretStorage** của VS Code (không nằm trong file dự án).
- Khi kết nối, thư mục gốc trên máy chủ (`/` hoặc `remotePath`) được thêm vào Explorer với tên hồ sơ — bạn mở/sửa/lưu file trực tiếp trên server.
- Hồ sơ bật **tự động kết nối** sẽ được nối lại mỗi khi mở VS Code, không cần bấm gì.
- Ngắt kết nối (hoặc xoá hồ sơ) sẽ gỡ thư mục từ xa khỏi workspace.

## Tính năng

- Quét QR **ngay trong VS Code**: dán ảnh chụp màn hình bằng `Ctrl+V`, kéo–thả ảnh, chọn file, hoặc camera (nếu môi trường cho phép).
- Hiểu nhiều định dạng QR: JSON phẳng, JSON kiểu API Pterodactyl (`attributes.sftp_details`), `sftp://user:pass@host:port`, `user@host:port pass`, các dòng `key=value`, nội dung base64/URL-encoded.
- Nhập xong là kết nối luôn; nếu QR không có mật khẩu, extension hỏi một lần rồi lưu vào SecretStorage.
- Nhiều máy chủ cùng lúc: mỗi hồ sơ là một thư mục riêng trong Explorer.
- Thanh trạng thái hiển thị kết nối và phản hồi mỗi lần lưu file.

## Cài đặt

Cách 1 — từ file VSIX:

```bash
code --install-extension luminecloud-sftp-manager-0.6.0.vsix
```

Cách 2 — phát triển cục bộ: mở thư mục này trong VS Code, nhấn `F5` để chạy Extension Development Host.

## Cách dùng

Mở Command Palette (`Ctrl+Shift+P`) và chọn một trong:

| Lệnh | Việc |
| --- | --- |
| `LumineCloud SFTP: Quét mã QR để nhập SFTP` | Mở cửa sổ quét QR |
| `LumineCloud SFTP: Nhập thông tin SFTP từ clipboard` | Đọc text JSON/chuỗi kết nối từ clipboard |
| `LumineCloud SFTP: Nhập JSON/chuỗi kết nối thủ công` | Gõ hoặc dán vào ô nhập |
| `LumineCloud SFTP: Quản lý hồ sơ SFTP đã lưu` | Kết nối / ngắt / copy / xoá hồ sơ |
| `LumineCloud SFTP: Mở thư mục hồ sơ chia sẻ` | Mở thư mục chứa `profiles.json` trong file manager |

Luồng nhập: quét QR → (hỏi mật khẩu nếu thiếu) → lưu hồ sơ → tự kết nối → thư mục từ xa xuất hiện trong Explorer.

## Thử nhanh với QR mẫu

- Ảnh mẫu: `samples/qr-mau.png` — kéo–thả thẳng file này vào cửa sổ **Quét mã QR**.
- Dữ liệu gốc: `samples/qr-mau.json` — máy chủ giả `user.a1b2c3d4@node1.example.com:2022`, không có mật khẩu nên extension sẽ hỏi mật khẩu (nhập gì cũng được để thử giao diện, kết nối sẽ báo lỗi).

## Tạo mã QR: `scripts/make-qr.mjs`

Script sinh ảnh PNG đúng định dạng extension đọc được. Chạy tại **thư mục gốc dự án** — hoặc dùng `npm run qr -- <tham số>` từ bất kỳ đâu (npm tự về thư mục gốc); nếu đang đứng trong `scripts` thì gọi `node make-qr.mjs`. Ba cách dùng:

```bash
# 1. Nhập từng trường (nhanh nhất)
node scripts/make-qr.mjs --host node1.example.com --user user.a1b2c3d4 --pass "matkhau"

# 2. Từ file JSON (hoặc file chứa chuỗi sftp://) có sẵn
node scripts/make-qr.mjs du-lieu.json

# 3. Không tham số: hỏi lần lượt host → port → username → tên → id → đường dẫn → mật khẩu (ẩn khi gõ)
node scripts/make-qr.mjs
```

| Tham số | Ý nghĩa |
| --- | --- |
| `--host`, `--user` | Bắt buộc. Host được tự chuẩn hoá (bỏ `https://`, `/` cuối, `:port`) |
| `--pass` | Mật khẩu, tùy chọn |
| `--port` | Mặc định `2022`, kiểm tra trong khoảng 1–65535 |
| `--name`, `--id` | Tên máy chủ và identifier (giống panel trả về) |
| `--path` | `remotePath`, ví dụ `/home/container` |
| `--out`, `--size` | File PNG và cạnh ảnh (mặc định `sftp-<host>.png`, 640px) |
| `--flat` | Xuất JSON phẳng thay vì dạng panel |
| `--url` | Xuất chuỗi `sftp://user:pass@host:port` |
| `--print` | Chỉ in nội dung ra stdout, không tạo ảnh (để dán vào "Nhập từ clipboard") |

Định dạng mặc định bám đúng dữ liệu panel trả về:

```json
{"attributes":{"name":"Minecraft Survival","identifier":"a1b2c3d4","sftp_details":{"ip":"node1.example.com","port":2022,"username":"user.a1b2c3d4"}}}
```

## Định dạng QR được hỗ trợ

```jsonc
// 1. JSON phẳng
{ "host": "node.example.com", "port": 2022, "username": "user.abc123xy", "password": "..." }

// 2. JSON kiểu API panel (attributes.sftp_details)
{
  "attributes": {
    "name": "Minecraft Survival",
    "identifier": "abc123xy",
    "sftp_details": { "ip": "node1.example.com", "port": 2022, "username": "user.abc123xy" }
  }
}
```

```
sftp://user.abc123xy:matkhau@node.example.com:2022
user.abc123xy@node.example.com:2022 matkhau
sftp_host=node.example.com
sftp_port=2022
sftp_username=user.abc123xy
```

Tên khoá không phân biệt hoa/thường, `_`, `-` (`sftp_host`, `sftpHost`, `SFTP Host` đều được).

## Tạo mã QR từ panel Pterodactyl

Panel không tự sinh QR, nhưng API client có sẵn `sftp_details`. Script Node ví dụ:

```js
import QRCode from 'qrcode';

const PANEL = 'https://panel.example.com';
const SERVER_ID = 'abc123xy';
const API_KEY = process.env.PTERO_API_KEY;

const res = await fetch(`${PANEL}/api/client/servers/${SERVER_ID}`, {
  headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
});
const { attributes } = await res.json();

await QRCode.toFile('sftp-qr.png', JSON.stringify({
  name: attributes.name,
  identifier: attributes.identifier,
  sftp_details: attributes.sftp_details, // ip, port, username
}));
```

Mở `sftp-qr.png` rồi dán vào cửa sổ quét của extension. API **không** trả mật khẩu (mật khẩu SFTP chính là mật khẩu tài khoản panel), nên extension sẽ hỏi mật khẩu khi nhập.

## Bảo mật

- Ảnh QR được xử lý hoàn toàn trong webview của VS Code, không gửi ra ngoài.
- Mật khẩu nằm trong `SecretStorage` của VS Code (mã hoá theo hệ điều hành) và trong `profiles.json` dưới dạng **đã mã hoá** (mặc định).
- `key.bin` chỉ chống lộ khi bạn chia sẻ riêng `profiles.json`; nó **không** chống được phần mềm độc hại chạy cùng tài khoản (đọc được cả key). Cần bảo mật tuyệt đối thì đặt `luminecloud.sharedProfiles.password` = `none`.
- Extension **chưa xác thực host key** của máy chủ (giống lần đầu dùng `sftp` CLI). Chỉ kết nối tới máy chủ bạn tin tưởng.
- File được đọc/ghi trực tiếp trên server, không có bản sao local — cân nhắc backup trước khi sửa file quan trọng.

## Hồ sơ chia sẻ cho app ngoài

Extension ghi hồ sơ ra một thư mục chuẩn để **app khác (không phải VS Code) đọc/ghi và đồng bộ 2 chiều**.

| Hệ điều hành | Thư mục mặc định |
| --- | --- |
| Windows | `%APPDATA%\LumineCloud` |
| macOS | `~/Library/Application Support/LumineCloud` |
| Linux | `$XDG_CONFIG_HOME/luminecloud` (hoặc `~/.config/luminecloud`) |

Đổi bằng setting `luminecloud.sharedProfiles.path`. Trong bảng điều khiển có mục **Hồ sơ chia sẻ** hiển thị đúng đường dẫn kèm nút mở thư mục; ngoài ra còn lệnh `LumineCloud SFTP: Mở thư mục hồ sơ chia sẻ`.

Cấu trúc thư mục:

```
LumineCloud/
├─ profiles.json   # danh sách hồ sơ (JSON, version 1)
└─ key.bin         # khoá AES-256-GCM (base64, 32 byte)
```

`profiles.json`:

```json
{
  "app": "luminecloud-sftp-manager",
  "version": 1,
  "updatedAt": "2026-10-30T12:00:00.000Z",
  "profiles": [
    {
      "name": "Minecraft Survival",
      "host": "node1.example.com",
      "port": 2022,
      "username": "user.ab12",
      "remotePath": "/home/container",
      "autoConnect": true,
      "updatedAt": "2026-10-30T11:59:00.000Z",
      "passwordEnc": { "alg": "aes-256-gcm", "iv": "…", "tag": "…", "data": "…" }
    }
  ]
}
```

**Về mật khẩu**: không thể hash — SFTP cần mật khẩu gốc để đăng nhập, hash một chiều thì không dùng được (app ngoài cũng vậy). Vì thế extension **mã hoá** bằng AES-256-GCM với khoá ngẫu nhiên trong `key.bin`:

- Chỉ copy `profiles.json` ra máy khác thì không đọc được mật khẩu.
- Khoá nằm cùng thư mục, nên phần mềm chạy trên **cùng máy/tài khoản** vẫn giải mã được — đây là điều kiện để app ngoài đăng nhập hộ.
- `luminecloud.sharedProfiles.password`: `encrypted` (mặc định) · `plain` · `none`.

**Đồng bộ**: extension theo dõi `profiles.json`; app ngoài ghi hồ sơ mới vào là VS Code nạp và tự kết nối (nếu bật tự động). Ngược lại, mọi thay đổi trong VS Code được ghi ra file. Xung đột giải quyết theo `updatedAt` (bản mới hơn thắng). Xoá hồ sơ ở app ngoài **không** lan sang VS Code (tránh mất dữ liệu); xoá trong VS Code thì file cũng được cập nhật.

## Thanh trạng thái & phản hồi khi lưu

- Thanh trạng thái bên phải hiển thị `$(cloud) SFTP x/y` (số hồ sơ đang kết nối); rê chuột để xem danh sách trạng thái, bấm để mở bảng điều khiển.
- Khi lưu file trên thư mục từ xa, thanh trạng thái đổi thành **Đang lưu…** rồi **Đã lưu <tên file>** (2,5 giây), hoặc **Lỗi lưu** nếu thất bại.

## Cấu hình

| Setting | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `luminecloud.defaultPort` | `2022` | Port dùng khi QR không có port |
| `luminecloud.defaultRemotePath` | `/` | Đường dẫn gốc khi mở kết nối nếu hồ sơ không có `remotePath` |
| `luminecloud.sharedProfiles.enabled` | `true` | Ghi hồ sơ ra thư mục chia sẻ |
| `luminecloud.sharedProfiles.path` | `""` | Thư mục chia sẻ (trống = mặc định theo OS) |
| `luminecloud.sharedProfiles.password` | `encrypted` | Cách lưu mật khẩu: `encrypted` · `plain` · `none` |

## Phát triển

```bash
npm install
npm run build     # xoá out/, biên dịch + copy jsQR vào media/
npm test          # 52 test: parser, giải mã QR, SFTP thật (ssh2), hồ sơ chia sẻ, webview
npm run package   # tạo file .vsix (kèm dependency runtime)
npm run qr -- --help
```

Cấu trúc:

```
src/parse/parsePayload.ts        # nhận dạng & chuẩn hoá payload QR
src/sftp/                        # client SFTP, quản lý kết nối, FileSystemProvider
src/webview/                     # bảng điều khiển + cửa sổ quét QR (offline)
src/commands/                    # luồng command & QuickPick
src/profiles/                    # SecretStorage, file chia sẻ (AES-GCM), đồng bộ 2 chiều
src/ui/statusBar.ts              # thanh trạng thái + phản hồi khi lưu
scripts/make-qr.mjs              # tạo QR từ CLI
src/test/sftpLive.test.ts        # dựng SFTP server ảo (ssh2) để test kết nối thật
```

## Giới hạn đã biết

- Cần mở một thư mục/workspace trong VS Code để thư mục từ xa được gắn vào Explorer (kết nối vẫn thành công nếu không có).
- Không theo dõi thay đổi file từ bên ngoài (FTP khác sửa file thì bấm Refresh trong Explorer).
- Chỉ hỗ trợ xác thực bằng mật khẩu (Pterodactyl dùng mật khẩu), chưa hỗ trợ private key.
- Camera trong webview có thể bị VS Code chặn tuỳ nền tảng; khi đó dùng ảnh chụp màn hình + `Ctrl+V`.
