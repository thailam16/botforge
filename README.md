# 🤖 BotForge

Tạo chatbot Telegram của riêng bạn — mô tả bằng lời, chọn vài tính năng, rồi để nó
**chạy 24/7 miễn phí trên Cloudflare**. Không cần máy tính bật suốt ngày đêm, không cần
thuê máy chủ.

Bạn cần: một khoá API của dịch vụ AI + một token bot Telegram + vài câu mô tả bot làm gì.

```
Telegram  ──►  Cloudflare Worker  ──►  AI (Gemini / OpenAI / máy chủ của bạn)
                     │
                     └──►  D1 (cơ sở dữ liệu)  ──►  trí nhớ, lời nhắc, bữa ăn, chi tiêu
```

> **Chưa từng dùng dòng lệnh?** Đọc [HUONG-DAN.md](HUONG-DAN.md) — bản chỉ dẫn từng bước,
> viết cho người không rành kỹ thuật.

---

## Cài trong một lệnh

```bash
git clone <địa-chỉ-repo-của-bạn> botforge && cd botforge
bash cai-dat.sh
```

Script tự kiểm tra máy, cài thư viện rồi mở trình hướng dẫn hỏi bạn 6 bước bằng tiếng Việt:

| Bước | Hỏi gì |
|---|---|
| 1 | Bot dùng bộ não nào — gọi thử luôn, liệt kê model có sẵn, tự kiểm tra xem có đọc được ảnh không |
| 2 | Token bot Telegram (kiểm tra và lấy tên bot ra luôn) |
| 3 | Bot tên gì, bắt đầu từ mẫu nào, **mô tả vai bot bằng lời của bạn** → AI viết persona cho bạn duyệt |
| 4 | Bật/tắt từng tính năng |
| 5 | Ai được dùng bot |
| 6 | Tạo cơ sở dữ liệu, cất khoá, triển khai, nối webhook — máy làm hết |

Xong thì mở Telegram, tìm bot của bạn, bấm **Start**. Bot sống 24/7 từ lúc đó.

> Thêm bot thứ hai, thứ ba? Chạy lại `npm run setup`. Một Worker nuôi được nhiều bot.

---

## Vì sao "24/7" mà không tốn tiền

Bot Telegram kiểu truyền thống cần một tiến trình chạy mãi trên một cái máy nào đó —
máy ngủ, mất điện hay mất mạng là bot câm.

BotForge chạy theo kiểu *webhook*: Cloudflare giữ sẵn mã của bạn ở hơn 300 thành phố và
**chỉ đánh thức nó khi có tin nhắn**. Không có tin thì không chạy, không tốn gì. Việc theo
lịch (nhắc bữa ăn, tổng kết ngày, chắt lọc trí nhớ) do Cron Trigger gọi dậy 5 phút một lần.

Gói miễn phí Cloudflare cho 100.000 lượt gọi và 5 triệu dòng đọc cơ sở dữ liệu **mỗi ngày** —
một gia đình dùng hết chừng 1%. Chi phí thực tế chỉ là tiền gọi AI, và bot có sẵn trần
60 lượt/giờ cho mỗi người để hoá đơn không bao giờ vượt tầm kiểm soát.

---

## Bot của bạn nằm gọn trong một file

Mỗi bot là một file `bots/<tên>.yaml`. Sửa file, chạy `npm run deploy`, bot đổi tính nết ngay.

```yaml
key: troly                     # mã ngắn, cũng là đường dẫn webhook /tg/troly
name: Trợ lý
emoji: 🤝
timezone: Asia/Ho_Chi_Minh
rate_limit_per_hour: 60        # trần số lượt gọi AI mỗi người mỗi giờ

llm:
  provider: openai             # openai (mọi máy chủ tương thích) | gemini
  model: gpt-4o-mini
  vision: true                 # bộ não này có đọc được ảnh không
  base_url_env: LLM_BASE_URL   # CHỈ ghi TÊN biến môi trường, không bao giờ ghi khoá thật
  api_key_env: LLM_API_KEY
  fallback:                    # không bắt buộc — dùng khi nhà chính hết lượt hoặc cần đọc ảnh
    provider: gemini
    model: gemini-2.5-flash
    api_key_env: GEMINI_API_KEY

persona: |
  Bạn là trợ lý riêng, nói tiếng Việt tự nhiên, xưng "mình" và gọi người dùng là "bạn".
  Điềm tĩnh, lý trí, thẳng thắn nhưng mềm mỏng...

style:
  - Trả lời ngắn gọn, đi thẳng vào việc.
  - Không chắc thì nói thẳng là chưa chắc.

access:
  mode: claim                  # claim | whitelist | open
  users: []
  groups: []                   # id nhóm được phép gọi bot
  group_trigger: ["Trợ lý ơi"] # trong nhóm, chỉ trả lời khi nghe những cụm này

quiet_hours: { from: 23, to: 6 }   # khoảng giờ bot tuyệt đối không tự nhắn

plugins:
  memory:    { enabled: true, distill_at: "23:15" }
  reminders: { enabled: true }
```

Ba mẫu dựng sẵn trong `templates/`: trợ lý cá nhân, huấn luyện viên dinh dưỡng, quản gia gia đình.

### Chọn bộ não

BotForge nói chuyện được với hai họ API, đủ phủ gần như mọi dịch vụ:

- **`gemini`** — Google Gemini API (có mức miễn phí, đọc được ảnh).
- **`openai`** — mọi máy chủ theo chuẩn OpenAI: OpenAI, OpenRouter, DeepSeek, Groq, Ollama
  chạy ở máy bạn, hay máy chủ tự dựng của riêng bạn. Chỉ cần đổi `LLM_BASE_URL`.

Trình hướng dẫn tự hỏi máy chủ xem có những model nào, và **gửi thử một ảnh tí hon** để biết
bộ não đó có nhìn được ảnh không. Không nhìn được thì nó ghi `vision: false`, và bạn có thể
thêm một bộ não phụ chỉ để lo phần ảnh — bot sẽ tự chọn đúng nơi cho từng lượt.

Đổi bộ não về sau: `npm run setup` (tạo lại), hoặc sửa khối `llm` trong YAML rồi
`npx wrangler secret put LLM_BASE_URL` và `npm run deploy`.

### Chế độ truy cập

| `mode` | Nghĩa là |
|---|---|
| `claim` | Người nhắn **đầu tiên** trở thành chủ bot, sau đó người lạ bị lờ đi. Tiện và an toàn. |
| `whitelist` | Chỉ những `chat_id` bạn khai báo mới nói chuyện được. |
| `open` | Ai cũng chat được — bắt buộc khai báo `rate_limit_per_hour`. |

Người lạ nhắn riêng thì bot im lặng; bị kéo vào nhóm lạ thì bot tự rời.
Không biết `chat_id` của mình? Nhắn cho [@userinfobot](https://t.me/userinfobot).

---

## Tính năng dựng sẵn (bật/tắt trong `plugins`)

### 🧠 `memory` — trí nhớ dài hạn
Bot nhớ hoàn cảnh, sở thích, cam kết của bạn qua nhiều tháng. Mỗi đêm (mặc định 23:15) nó đọc
lại hội thoại trong ngày và viết gọn phần đáng nhớ, nên trí nhớ không phình mãi.
Lệnh: `/nho`, `/quen`.

### ⏰ `reminders` — nhắc việc & lịch chủ động
Nhắn "9h sáng mai nhắc mình họp team" là xong — bot tự hiểu và đặt lịch, kể cả lịch lặp
hằng ngày/tuần/tháng. Trong giờ yên tĩnh bot giữ lời nhắc lại, sáng hôm sau mới nhắc.
Lệnh: `/nhac`, `/xoanhac <số>`.

### 🥗 `nutrition` — theo dõi dinh dưỡng
Chụp ảnh bữa ăn gửi cho bot: nó nhận diện món, ước lượng calo và đạm/tinh bột/béo, cộng dồn
theo ngày, vẽ thanh tiến độ so với chỉ tiêu. Theo dõi cả cân nặng, % mỡ, buổi tập. Nhắc hỏi
bữa ăn, tổng kết ngày và báo cáo tuần đều tự động.

> **BMR, TDEE và mọi phép cộng do mã nguồn tính** (công thức Mifflin-St Jeor), AI chỉ làm việc
> nhận diện món ăn — để AI tự cộng là có ngày sai số.

Lệnh: `/homnay`, `/homqua`, `/tuan`, `/hoso`, `/cannang`, `/huy`.

### 💰 `expense` — sổ chi tiêu & việc cần làm
Nhắn "trưa nay ăn phở 45k" là vào sổ, tự phân nhóm. "Nhớ mua sữa" thành việc cần làm.
Tối hỏi lại nếu cả ngày chưa ghi khoản nào; Chủ nhật gửi báo cáo tuần.
Lệnh: `/chi`, `/thang`, `/viec`, `/xong <số>`.

Bot nào cũng có sẵn `/start`, `/help`, `/status`.

---

## Bot ghi dữ liệu bằng cách nào

AI vừa trả lời bạn, vừa viết thêm những dòng máy đọc được ở cuối câu trả lời:

```
Bữa trưa của bạn khoảng 520 kcal nha.
BOT_DATA: {"kind":"meal","date":"2026-09-19","slot":"trua","title":"Cơm gà","items":[...]}
```

Worker cắt các dòng `BOT_DATA:` ra, ghi vào cơ sở dữ liệu, rồi **chỉ gửi phần văn xuôi** cho
bạn. Dòng nào hỏng thì bỏ qua chứ không bao giờ lọt ra ngoài. Nhờ vậy việc "nói chuyện" và
việc "ghi sổ" tách bạch: AI lo hiểu tiếng Việt, mã nguồn lo con số.

---

## Các lệnh thường dùng

```bash
bash cai-dat.sh    # cài lần đầu (tự làm mọi thứ)
npm run setup      # tạo thêm bot mới
npm run dev        # chạy thử ngay trên máy
npm test           # 32 bài kiểm thử, không cần mạng, không tốn tiền AI
npm run check      # soát cú pháp + cấu hình + rà khoá bí mật lỡ lọt vào file
npm run deploy     # đưa thay đổi lên Cloudflare
npm run webhook    # nối lại Telegram với Worker
npm run db:init    # tạo bảng trong cơ sở dữ liệu
```

### Tự động triển khai mỗi khi push

Repo có sẵn `.github/workflows/deploy.yml`. Vào **Settings → Secrets and variables → Actions**
thêm hai secret:

- `CLOUDFLARE_API_TOKEN` — tạo ở Cloudflare dashboard, mẫu quyền *Edit Cloudflare Workers*
- `CLOUDFLARE_ACCOUNT_ID` — xem ở trang Workers của Cloudflare

Từ đó mỗi lần `git push` lên `main`: GitHub chạy kiểm thử rồi tự deploy. Chưa thêm secret thì
bước deploy tự bỏ qua, không báo đỏ.

---

## Thêm tính năng mới

Một plugin là một file trong `src/plugins/`, khai báo bốn thứ (đều không bắt buộc):

```js
export default {
  name: 'sach',
  label: 'Nhật ký đọc sách',

  // 1. Cho AI biết nó được ghi loại dữ liệu nào
  dataKinds: [{ kind: 'book', doc: '{"kind":"book","title":"...","pages":30}' }],

  // 2. Nhét thông tin vào đầu mỗi lượt chat
  async promptBlock({ store, chatId }) { return 'SÁCH ĐANG ĐỌC: ...'; },

  // 3. Nhận dữ liệu AI phát ra và ghi vào cơ sở dữ liệu
  async applyData({ store, chatId }, item) { /* ... */ },

  // 4. Lệnh gạch chéo và việc chạy theo giờ
  commands: { '/sach': { desc: 'Xem tiến độ đọc', run: async (ctx) => '...' } },
  jobs: [{ id: 'nhac-doc', at: '21:00', perUser: true, run: async (ctx) => 'Tối nay đọc chưa?' }],
};
```

Khai báo trong `src/plugins/index.js`, thêm bảng vào `schema.sql` nếu cần, thêm tên vào
`KNOWN_PLUGINS` của `scripts/build-config.mjs`, rồi bật trong file YAML của bot.

---

## Bảo mật

Khoá API không bao giờ nằm trong mã nguồn — chúng là Cloudflare Secret, bản ở máy bạn nằm
trong `.env` (quyền `600`, đã bị `.gitignore` chặn). YAML chỉ ghi *tên* biến môi trường, và
`npm run check` sẽ chặn nếu có khoá lỡ lọt vào file sắp commit.

Telegram gọi vào kèm mật khẩu webhook riêng cho từng bot — thiếu là Worker từ chối ngay.
Chữ trong ảnh và tin chuyển tiếp được coi là **dữ liệu, không phải mệnh lệnh**. Mọi tin gửi ra
và mọi dòng log đều đi qua bộ lọc xoá chuỗi trông giống khoá.

Chi tiết đầy đủ: [SECURITY.md](SECURITY.md).

---

## Gặp trục trặc?

| Hiện tượng | Cách xử lý |
|---|---|
| Bot không trả lời | `npx wrangler tail` để xem log trực tiếp; thử `https://<worker>.workers.dev/health` |
| Nhắn mà im ru | Sai webhook — chạy `npm run webhook`; hoặc bạn không nằm trong danh sách được phép |
| "Chưa có khoá AI" | `npx wrangler secret put LLM_API_KEY` (hoặc `GEMINI_API_KEY`) |
| "Chưa xem được ảnh" | Bộ não hiện tại không có vision — thêm `fallback` có vision vào YAML |
| Lịch không chạy | Cron chỉ chạy khi Worker đã deploy thật; kiểm tra `[triggers]` trong `wrangler.toml` |
| Sửa YAML mà bot không đổi | Phải `npm run deploy` (cấu hình được đóng gói vào Worker lúc build) |

---

## Giấy phép

MIT — dùng thoải mái, sửa thoải mái.
