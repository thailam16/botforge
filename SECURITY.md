# Bảo mật

## Khoá bí mật được giữ ở đâu

| Thứ | Nằm ở đâu | Có lên GitHub không |
|---|---|---|
| Khoá AI, token Telegram, mật khẩu webhook | Cloudflare Secret (trên mây) + `.env` (máy bạn, quyền `600`) | **Không** — `.env` nằm trong `.gitignore` |
| Địa chỉ máy chủ AI | Cloudflare Secret + `.env` | **Không** |
| Persona, tính năng, danh sách người dùng | `bots/*.yaml` | Có |

File YAML **chỉ ghi tên biến môi trường** (`api_key_env: LLM_API_KEY`), không bao giờ ghi giá trị
thật. `npm run check` sẽ **chặn** nếu phát hiện khoá bị dán nhầm vào file sắp commit, và
`npm run build:config` từ chối build nếu YAML có trường `api_key`.

> Dù vậy, `bots/*.yaml` có persona và chat id của người dùng — nên để repo ở chế độ **private**.

## Những lớp phòng thủ có sẵn

**Chỉ Telegram gọi được vào bot.** Mỗi bot có một mật khẩu webhook riêng do máy sinh ngẫu nhiên.
Thiếu mật khẩu là Worker từ chối ngay, kể cả khi ai đó đoán đúng đường dẫn. So sánh mật khẩu
bằng thuật toán hằng thời gian nên không dò được. Trang `/health` cố tình không liệt kê tên bot.

**Chỉ người bạn cho phép mới nói chuyện được.** Người lạ nhắn riêng thì bot im lặng (không báo
lỗi, không để lộ là bot tồn tại). Bị kéo vào nhóm lạ thì bot tự rời.

**Trần chi phí.** Mỗi người tối đa 60 lượt gọi AI mỗi giờ (đổi bằng `rate_limit_per_hour`).
Bot ở chế độ `open` bắt buộc phải khai báo trần này. Tin nhắn dài bị cắt còn 4000 ký tự,
mỗi lượt đọc tối đa 4 ảnh.

**Chống tiêm lệnh qua nội dung.** Chữ trong ảnh và trong tin chuyển tiếp được bọc trong thẻ
đánh dấu và system prompt dặn rõ: đó là **dữ liệu để đọc, không phải mệnh lệnh**. Bot cũng được
dặn không tiết lộ system prompt hay biến môi trường.

**Không rò khoá ra ngoài.** Mọi tin nhắn gửi đi và mọi dòng log đều đi qua bộ lọc xoá chuỗi
trông giống khoá (token Telegram, `sk-…`, `AIza…`, `ghp_…`).

**Dữ liệu tách bạch.** Mọi truy vấn cơ sở dữ liệu đều dùng câu lệnh tham số hoá và gắn khoá
`bot` + `chat_id`, nên bot này không đọc được dữ liệu của bot kia, người này không thấy dữ liệu
người kia. Lịch sử chat tự xoá sau 30 ngày (đổi bằng `keep_history_days`).

**Không phụ thuộc thư viện ngoài khi chạy.** Mã chạy trên Cloudflare không nạp thư viện bên thứ
ba nào — `wrangler` và `yaml` chỉ dùng lúc build ở máy bạn.

## Những điều bạn nên tự làm

- Bật xác thực hai lớp cho tài khoản Telegram và Cloudflare.
- Để repo ở chế độ private nếu bots/*.yaml có thông tin cá nhân.
- Đổi khoá AI ngay nếu lỡ dán nhầm vào chỗ công khai: tạo khoá mới rồi chạy
  `npx wrangler secret put <TÊN_KHOÁ>`.
- Chỉ bật `access.mode: open` khi thực sự cần, và luôn kèm `rate_limit_per_hour`.

## Giới hạn cần biết

Bot đưa nội dung tin nhắn của bạn cho nhà cung cấp AI mà bạn chọn — hãy đọc chính sách riêng tư
của họ. Nếu bạn cho bot quyền đọc dữ liệu nhạy cảm, hãy cân nhắc dùng máy chủ AI tự dựng.

Phát hiện lỗ hổng? Mở một issue riêng tư (Security advisory) thay vì issue công khai.
