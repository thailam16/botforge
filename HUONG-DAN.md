# 📘 Hướng dẫn cho người không rành kỹ thuật

Bạn sẽ có một con chatbot Telegram của riêng mình, chạy suốt ngày đêm trên mây.
Không cần biết lập trình. Làm theo đúng thứ tự bên dưới, khoảng 15 phút.

---

## Phần 1 — Chuẩn bị 3 thứ (10 phút)

### 1️⃣ Node.js — phần mềm để chạy dự án

Mở https://nodejs.org → bấm nút tải bản **LTS** → cài như cài một ứng dụng bình thường
(bấm Next/Tiếp tục đến hết).

### 2️⃣ Khoá AI — "bộ não" cho bot

Cách miễn phí, dễ nhất:

1. Mở https://aistudio.google.com/apikey
2. Đăng nhập bằng Gmail
3. Bấm **Create API key** → **Copy**
4. Dán tạm vào Ghi chú / Notes, lát nữa cần

> Bạn đã có sẵn một máy chủ AI riêng? Chuẩn bị địa chỉ máy chủ (dạng `https://.../v1`)
> và khoá của nó — trình hướng dẫn sẽ hỏi.

### 3️⃣ Bot Telegram — "thân xác" cho bot

1. Mở Telegram, tìm **@BotFather** (có dấu tích xanh)
2. Bấm **Start**, gõ `/newbot`
3. Nó hỏi tên hiển thị → gõ tên bạn thích (ví dụ: `Trợ lý của tôi`)
4. Nó hỏi username → gõ tên kết thúc bằng `bot` (ví dụ: `troly_cua_toi_bot`)
5. Nó trả về một dòng dài dạng `8123456:AAH...` → **copy** dòng đó, dán tạm vào Ghi chú

---

## Phần 2 — Cài (5 phút)

Mở **Terminal** (máy Mac: bấm `Cmd + dấu cách`, gõ `Terminal`, Enter), rồi dán từng dòng sau
và bấm Enter:

```bash
cd ~/Desktop
```

```bash
git clone <địa-chỉ-repo> botforge && cd botforge
```

```bash
bash cai-dat.sh
```

Từ đây máy sẽ **hỏi bạn từng câu bằng tiếng Việt**. Cứ trả lời:

| Nó hỏi | Bạn làm |
|---|---|
| Bot dùng bộ não nào? | Gõ số tương ứng rồi Enter |
| Dán khoá AI | Dán khoá đã copy ở bước 2️⃣ |
| Token bot Telegram | Dán dòng dài đã copy ở bước 3️⃣ |
| Bot tên gì | Gõ tên bạn thích |
| Bắt đầu từ mẫu nào | Chọn mẫu gần ý bạn nhất |
| Mô tả bot của bạn | **Cứ kể tự nhiên** như nói với bạn bè: bot đóng vai gì, xưng hô ra sao, giúp việc gì |
| Bật tính năng nào | Gõ `c` (có) hoặc `k` (không) |
| Ai được dùng bot | Chọn 1 nếu chỉ mình bạn dùng |
| Triển khai luôn? | Gõ `c` |

Giữa chừng, trình duyệt sẽ mở ra trang **Cloudflare** để bạn đăng nhập (tạo tài khoản miễn phí
nếu chưa có) và bấm **Allow**. Đó là nơi bot sẽ sống.

Xong, quay lại Telegram, tìm bot của bạn và bấm **Start**. Nhắn thử một câu xem nó trả lời!

---

## Phần 3 — Dùng hằng ngày

- Nhắn chuyện bình thường, bot hiểu tiếng Việt tự nhiên.
- Gõ `/help` để xem bot làm được gì.
- Bot tự nhắn trước khi tới giờ đã hẹn (nhắc việc, tổng kết ngày…).

### Muốn đổi tính cách của bot?

Mở file `bots/<tên-bot>.yaml` bằng TextEdit / Notepad, sửa đoạn `persona`, lưu lại, rồi chạy:

```bash
npm run deploy
```

### Muốn thêm một bot nữa?

```bash
npm run setup
```

Tạo bot mới ở BotFather trước, rồi chạy lệnh trên. Một tài khoản Cloudflare nuôi được nhiều bot.

---

## Gặp lỗi thì sao?

| Bạn thấy | Làm gì |
|---|---|
| `command not found: node` | Chưa cài Node.js — quay lại bước 1️⃣ |
| `command not found: git` | Máy Mac: gõ `xcode-select --install` rồi thử lại |
| Bot không trả lời gì | Gõ `npm run webhook` để nối lại, rồi nhắn thử |
| Bot bảo "chưa có khoá AI" | Gõ `npm run setup`, làm lại bước dán khoá |
| Vẫn bí | Chạy `npx wrangler tail` rồi nhắn cho bot — dòng chữ hiện ra sẽ cho biết bot vướng ở đâu |

---

## Bot có tốn tiền không?

- **Cloudflare**: gói miễn phí, thoải mái cho nhu cầu cá nhân/gia đình.
- **Khoá AI**: Google Gemini có mức miễn phí hằng ngày. Dùng nhiều mới phải trả tiền.
- Bot có sẵn giới hạn **60 tin/giờ cho mỗi người** để không bao giờ bị "cháy" hoá đơn ngoài ý muốn.
