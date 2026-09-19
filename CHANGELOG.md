# Nhật ký thay đổi

Mọi thay đổi đáng kể của BotForge được ghi ở đây, mới nhất lên trên.

## 2026-09-19 — Bảo mật, cài đặt một lệnh, tự dò bộ não

**Cài dễ hơn**
- `bash cai-dat.sh`: một lệnh lo hết — kiểm tra Node.js, cài thư viện, tự kiểm tra rồi mở
  trình hướng dẫn. Thiếu gì nó chỉ luôn cách khắc phục.
- Thêm [HUONG-DAN.md](HUONG-DAN.md): chỉ dẫn từng bước cho người chưa từng dùng dòng lệnh.

**Chọn bộ não thông minh hơn**
- Trình hướng dẫn tự nhận ra máy chủ AI đã cấu hình sẵn trong `.env` và mời dùng luôn.
- Tự hỏi máy chủ xem có những model nào để bạn chọn, thay vì phải gõ tay tên model.
- Tự gửi một ảnh tí hon để biết bộ não có đọc được ảnh không; nếu không thì ghi `vision: false`
  và mời thêm một bộ não phụ chuyên lo ảnh.
- Lượt có ảnh tự động đi tới nhà cung cấp đọc được ảnh; không có nhà nào đọc được thì bot nói
  thẳng thay vì gọi AI rồi báo lỗi.

**Bảo mật**
- Mật khẩu webhook giờ **bắt buộc**: thiếu là Worker từ chối mọi tin nhắn. So sánh bằng thuật
  toán hằng thời gian. Chặn sớm body lớn bất thường.
- `/health` không còn liệt kê tên bot (đường dẫn webhook phải khó đoán).
- Trần `rate_limit_per_hour` (mặc định 60 lượt/người/giờ) chặn hoá đơn AI phình ngoài ý muốn;
  bot chế độ `open` bắt buộc phải khai báo trần này.
- Khoá API không được phép nằm trong YAML nữa — chỉ ghi *tên* biến môi trường. `npm run check`
  rà toàn bộ file sắp commit và chặn nếu phát hiện chuỗi trông như khoá.
- `.env` được tạo với quyền `600`. Log lỗi cũng đi qua bộ lọc che khoá.
- Cắt tin quá dài (4000 ký tự) và giới hạn 4 ảnh mỗi lượt.
- Thêm [SECURITY.md](SECURITY.md).

**Khác**
- 32 bài kiểm thử (thêm: xác thực webhook, trần số lượt, định tuyến theo khả năng đọc ảnh,
  dò model/vision của máy chủ).

## 2026-09-19 — Bản đầu tiên (1.0.0)

- Một Worker phục vụ nhiều bot Telegram cùng lúc, mỗi bot một file YAML trong `bots/`.
- Trình hướng dẫn tiếng Việt `npm run setup`: hỏi khoá AI, token Telegram, tên bot, mô tả vai →
  AI tự viết persona → chọn tính năng → tạo cơ sở dữ liệu → triển khai → nối webhook.
- Hai họ API: Google Gemini và mọi máy chủ tương thích OpenAI, có nhà dự phòng khi hết lượt.
- Bốn plugin bật/tắt được: trí nhớ dài hạn, nhắc việc, theo dõi dinh dưỡng, sổ chi tiêu & việc cần làm.
- Chạy 24/7 trên Cloudflare Workers (webhook + cron 5 phút), dữ liệu trong D1.
- Kiểm thử chạy offline nhờ giả lập D1 bằng `node:sqlite`.

**Lưu ý khi nâng cấp về sau:** sửa gì cũng ghi vào file này rồi mới deploy.
