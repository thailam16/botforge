# Thư mục bots/

Mỗi file `*.yaml` ở đây = **một con bot**. Worker sẽ phục vụ tất cả cùng lúc,
mỗi bot một đường dẫn webhook riêng `/tg/<key>`.

- Tạo nhanh bằng `npm run setup` (wizard hỏi từng bước bằng tiếng Việt).
- Hoặc chép một file trong `../templates/` vào đây rồi sửa tay.
- File bắt đầu bằng dấu `_` sẽ bị bỏ qua (tiện để tắt tạm một bot).

Sau khi sửa, chạy `npm run deploy` để đưa thay đổi lên Cloudflare.
