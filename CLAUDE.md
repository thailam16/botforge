# Ghi chú cho AI khi sửa dự án này

## Quy tắc cứng
1. **Đọc `CHANGELOG.md` trước khi sửa**, và **cập nhật nó sau khi sửa** (mục mới lên trên cùng).
2. Chạy `npm run check && npm test` trước khi commit. Không được để test đỏ.
3. Cấu hình bot trong `bots/*.yaml` được **đóng gói vào Worker lúc build** qua
   `scripts/build-config.mjs` → `src/generated/bots.js` (file này tự sinh, đừng sửa tay,
   đừng commit). Worker không đọc được file trên đĩa.
4. **Không để LLM tự tính số.** Mọi phép cộng, BMR/TDEE, tổng tiền đều do JS tính.
   LLM chỉ nhận diện và phát ra `BOT_DATA: {...}`.
5. **Khoá bí mật chỉ nằm ở Cloudflare Secret và `.env`** (đã gitignore). YAML chỉ được ghi TÊN
   biến môi trường (`api_key_env`, `base_url_env`) — `npm run check` sẽ chặn nếu khoá lọt vào
   file sắp commit, và validator từ chối YAML có trường `api_key`.
6. Mọi lối vào phải **fail closed**: thiếu mật khẩu webhook thì từ chối, không mặc định cho qua.
7. Đây là dự án mã nguồn mở dùng chung — tài liệu và mã KHÔNG nhắc tên bot riêng của ai.

## Bản đồ mã nguồn
| Đường dẫn | Việc |
|---|---|
| `src/index.js` | Điểm vào Worker: webhook `/tg/<key>`, `/health`, cron `scheduled()` |
| `src/core/runtime.js` | Một lượt chat: quyền → gom ảnh → prompt → LLM → ghi dữ liệu → trả lời |
| `src/core/scheduler.js` | Chạy `jobs` của plugin đúng giờ, chống chạy trùng, tôn trọng giờ yên tĩnh |
| `src/core/prompt.js` | Ghép system prompt từ persona + khối của từng plugin |
| `src/core/protocol.js` | Tách `BOT_DATA:` khỏi câu trả lời |
| `src/core/db.js` | Bọc D1, mọi truy vấn gắn khoá `bot` |
| `src/llm/` | Provider Gemini + tương thích OpenAI; có dự phòng và định tuyến theo khả năng đọc ảnh |
| `src/plugins/` | memory, reminders, nutrition, expense |
| `test/helpers.mjs` | Giả lập D1 (node:sqlite) + fetch, nên test chạy offline |
| `scripts/setup.mjs` | Trình hướng dẫn; xuất `listModels`/`probeVision` để test import được |
| `cai-dat.sh` | Lối vào cho người không rành kỹ thuật |

## Thêm plugin
Xem mục "Thêm tính năng mới" trong README. Nhớ: khai báo trong `src/plugins/index.js`,
thêm bảng vào `schema.sql`, thêm tên plugin vào `KNOWN_PLUGINS` của `scripts/build-config.mjs`,
và viết test trong `test/flow.test.mjs`.
