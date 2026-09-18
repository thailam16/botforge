# Nhật ký thay đổi

Mọi thay đổi đáng kể của BotForge được ghi ở đây, mới nhất lên trên.

## 2026-09-19 — Bản đầu tiên (1.0.0)

**Có gì:**
- Một Worker phục vụ nhiều bot Telegram cùng lúc, mỗi bot một file YAML trong `bots/`.
- Wizard tiếng Việt `npm run setup`: hỏi khoá AI, token Telegram, tên bot, mô tả vai →
  AI tự viết persona → chọn tính năng → tạo CSDL → triển khai → nối webhook.
- Hai nhà cung cấp AI: Google Gemini và mọi API tương thích OpenAI (OpenAI, OpenRouter,
  DeepSeek, Ollama, proxy riêng). Có cơ chế dự phòng khi nhà chính hết lượt.
- Bốn plugin bật/tắt được: trí nhớ dài hạn, nhắc việc, theo dõi dinh dưỡng, sổ chi tiêu & việc cần làm.
- Chạy 24/7 trên Cloudflare Workers (webhook + cron 5 phút), dữ liệu trong D1.
- 21 bài kiểm thử tự động chạy được ngay trên máy, không cần mạng.

**Lưu ý khi nâng cấp về sau:** sửa gì cũng ghi vào file này rồi mới deploy.
