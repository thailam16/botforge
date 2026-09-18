# 🤖 BotForge

Khung sườn để **tự tạo chatbot Telegram của riêng bạn** — như Bơ (quản gia), Lisa (cố vấn)
hay PT Nger (huấn luyện viên dinh dưỡng) — rồi cho nó **chạy 24/7 miễn phí trên Cloudflare**,
không cần để một cái máy tính bật suốt ngày đêm.

Bạn chỉ cần: một khoá API của dịch vụ AI + một token bot Telegram + vài câu mô tả bot làm gì.

```
Telegram  ──►  Cloudflare Worker  ──►  AI (Gemini / OpenAI…)
                     │
                     └──►  D1 (cơ sở dữ liệu)  ──►  trí nhớ, bữa ăn, chi tiêu, lời nhắc
```

---

## Bắt đầu trong 5 phút

**Cần chuẩn bị**
1. [Node.js](https://nodejs.org) phiên bản 20 trở lên.
2. Tài khoản [Cloudflare](https://dash.cloudflare.com/sign-up) (miễn phí).
3. Khoá AI — dễ nhất là [Google AI Studio](https://aistudio.google.com/apikey), có gói miễn phí.
4. Token bot Telegram — mở Telegram, chat với [@BotFather](https://t.me/BotFather), gõ `/newbot`.

**Chạy**

```bash
git clone <địa-chỉ-repo-của-bạn> botforge
cd botforge
npm install
npm run setup
```

Wizard sẽ hỏi bạn từng bước bằng tiếng Việt:

| Bước | Hỏi gì |
|---|---|
| 1 | Dùng AI nào, dán khoá API vào (mình gọi thử xem có chạy không) |
| 2 | Token bot Telegram (mình kiểm tra và lấy tên bot ra luôn) |
| 3 | Bot tên gì, bắt đầu từ mẫu nào, **mô tả vai bot bằng lời của bạn** → AI viết persona |
| 4 | Bật/tắt từng tính năng |
| 5 | Ai được dùng bot |
| 6 | Tạo cơ sở dữ liệu, cất khoá, triển khai, nối webhook — mình làm hết |

Xong thì mở Telegram, tìm bot của bạn, bấm **Start**. Bot sống 24/7 từ lúc đó.

> Muốn thêm con bot thứ hai, thứ ba? Chạy lại `npm run setup`. Một Worker nuôi được nhiều bot.

---

## Vì sao "chạy 24/7" mà không tốn tiền

Ba bot cũ chạy theo kiểu *long-poll*: một tiến trình Node phải sống mãi trên máy Mac mini —
máy ngủ, mất điện hay mất mạng là bot câm.

BotForge chạy theo kiểu *webhook*: Cloudflare giữ sẵn mã của bạn ở hơn 300 thành phố,
**có tin nhắn mới thì mới đánh thức mã dậy**. Không có tin thì không chạy, không tốn gì.
Lịch chủ động (nhắc bữa ăn, tổng kết ngày, chắt lọc trí nhớ) do Cron Trigger của Cloudflare
gọi dậy 5 phút một lần.

Gói miễn phí Cloudflare: 100.000 lượt gọi/ngày, 5 triệu dòng đọc CSDL/ngày —
một gia đình dùng hết khoảng 1% trong số đó. Chi phí thực tế chỉ là tiền gọi AI.

---

## Bot của bạn được mô tả trong một file

Mỗi bot là một file `bots/<tên>.yaml`. Đây là toàn bộ "linh hồn" của nó — sửa file, chạy
`npm run deploy`, là bot đổi tính nết ngay.

```yaml
key: nger                      # mã ngắn, cũng là đường dẫn webhook /tg/nger
name: Nger
emoji: 🥗
timezone: Asia/Ho_Chi_Minh

llm:
  provider: gemini             # gemini | openai
  model: gemini-2.5-flash
  fallback:                    # không bắt buộc — dùng khi nhà chính hết lượt
    provider: openai
    model: gpt-4o-mini

persona: |
  Bạn là huấn luyện viên cá nhân kiêm chuyên gia dinh dưỡng, nói tiếng Việt.
  Giọng thân thiện, động viên nhưng thẳng thắn...

style:
  - Trả lời gọn, xuống dòng rõ ràng.
  - Luôn kèm một lời khuyên ngắn cho bữa tiếp theo.

access:
  mode: whitelist              # claim | whitelist | open
  users:
    - { key: lam, chat_id: "1211241854", name: Lâm, role: owner }
  groups: []                   # id nhóm được phép gọi bot
  group_trigger: ["Nger ơi"]   # trong nhóm, chỉ trả lời khi nghe những cụm này

quiet_hours: { from: 23, to: 6 }   # khoảng giờ bot tuyệt đối không tự nhắn

plugins:
  memory:    { enabled: true, distill_at: "23:15" }
  reminders: { enabled: true }
  nutrition: { enabled: true, remind_meals: ["13:30","20:30"], daily_summary: "21:30" }
```

Ba mẫu dựng sẵn nằm trong `templates/`: trợ lý cá nhân, PT dinh dưỡng, quản gia gia đình.

### Chế độ truy cập

| `mode` | Nghĩa là |
|---|---|
| `claim` | Người nhắn **đầu tiên** trở thành chủ bot, sau đó người lạ bị lờ đi. Tiện và an toàn. |
| `whitelist` | Chỉ những `chat_id` bạn khai báo mới nói chuyện được. |
| `open` | Ai cũng chat được — cân nhắc, vì mỗi tin nhắn đều tốn tiền AI. |

Người lạ nhắn riêng thì bot im lặng; bị kéo vào nhóm lạ thì bot tự rời.
Không biết `chat_id` của mình? Nhắn cho [@userinfobot](https://t.me/userinfobot).

---

## Tính năng dựng sẵn (bật/tắt trong `plugins`)

### 🧠 `memory` — trí nhớ dài hạn
Bot nhớ hoàn cảnh, sở thích, cam kết của bạn qua nhiều tháng. Mỗi đêm (mặc định 23:15)
nó tự đọc lại hội thoại trong ngày và viết gọn phần đáng nhớ, nên trí nhớ không phình mãi.
Lệnh: `/nho` xem bot nhớ gì, `/quen` xoá sạch.

### ⏰ `reminders` — nhắc việc & lịch chủ động
Nhắn "9h sáng mai nhắc mình họp team" là xong — bot tự hiểu và đặt lịch, kể cả lịch lặp
hằng ngày/tuần/tháng. Trong giờ yên tĩnh bot giữ lời nhắc lại, sáng hôm sau mới nhắc.
Lệnh: `/nhac`, `/xoanhac <số>`.

### 🥗 `nutrition` — theo dõi dinh dưỡng (kiểu PT Nger)
Chụp ảnh bữa ăn gửi cho bot: nó nhận diện món, ước lượng calo và đạm/tinh bột/béo, cộng dồn
theo ngày, vẽ thanh tiến độ so với chỉ tiêu. Theo dõi cả cân nặng, % mỡ, buổi tập.
Nhắc hỏi bữa ăn, tổng kết ngày và báo cáo tuần đều tự động.

> **BMR, TDEE và mọi phép cộng do mã nguồn tính** (công thức Mifflin-St Jeor), AI chỉ làm
> việc nhận diện món ăn. Đây là bài học rút ra từ PT Nger: để AI tự cộng là có ngày sai số.

Lệnh: `/homnay`, `/homqua`, `/tuan`, `/hoso`, `/cannang`, `/huy`.

### 💰 `expense` — sổ chi tiêu & việc cần làm (kiểu Bơ / Lisa)
Nhắn "trưa nay ăn phở 45k" là vào sổ, tự phân nhóm. "Nhớ mua sữa" là thành việc cần làm.
Tối hỏi lại nếu cả ngày chưa ghi khoản nào; Chủ nhật gửi báo cáo tuần.
Lệnh: `/chi`, `/thang`, `/viec`, `/xong <số>`.

Ngoài ra bot nào cũng có `/start`, `/help`, `/status`.

---

## Bot ghi dữ liệu bằng cách nào

AI vừa trả lời bạn, vừa viết thêm những dòng máy đọc được ở cuối câu trả lời:

```
Bữa trưa của bạn khoảng 520 kcal nha.
BOT_DATA: {"kind":"meal","date":"2026-09-19","slot":"trua","title":"Cơm gà","items":[...]}
```

Worker cắt các dòng `BOT_DATA:` ra, ghi vào CSDL, rồi **chỉ gửi phần văn xuôi** cho bạn.
Dòng nào hỏng thì bỏ qua chứ không bao giờ lọt ra ngoài. Nhờ vậy, việc "nói chuyện" và việc
"ghi sổ" tách bạch: AI lo hiểu tiếng Việt, mã nguồn lo con số.

---

## Các lệnh thường dùng

```bash
npm run setup      # tạo bot mới (chạy lại được nhiều lần)
npm run dev        # chạy thử ngay trên máy
npm test           # 21 bài kiểm thử, không cần mạng
npm run check      # soát cú pháp + cấu hình bot trước khi deploy
npm run deploy     # đưa thay đổi lên Cloudflare
npm run webhook    # nối lại Telegram với Worker (khi đổi tên Worker)
npm run db:init    # tạo bảng trong cơ sở dữ liệu
```

### Tự động triển khai mỗi khi push

Repo đã có sẵn `.github/workflows/deploy.yml`. Vào **Settings → Secrets and variables →
Actions** thêm hai secret:

- `CLOUDFLARE_API_TOKEN` — tạo ở Cloudflare dashboard, mẫu quyền *Edit Cloudflare Workers*
- `CLOUDFLARE_ACCOUNT_ID` — xem ở trang Workers của Cloudflare

Từ đó, mỗi lần bạn `git push` lên nhánh `main`: GitHub chạy kiểm thử rồi tự deploy.

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

  // 3. Nhận dữ liệu AI phát ra và ghi vào CSDL
  async applyData({ store, chatId }, item) { /* ... */ },

  // 4. Lệnh gạch chéo và việc chạy theo giờ
  commands: { '/sach': { desc: 'Xem tiến độ đọc', run: async (ctx) => '...' } },
  jobs: [{ id: 'nhac-doc', at: '21:00', perUser: true, run: async (ctx) => 'Tối nay đọc chưa?' }],
};
```

Khai báo nó trong `src/plugins/index.js`, thêm bảng vào `schema.sql` nếu cần, rồi bật trong
file YAML của bot. Xong.

---

## Bảo mật

- Khoá API và token **không nằm trong mã nguồn**: chúng là Cloudflare Secret, còn bản ở máy
  bạn nằm trong `.env` (đã bị `.gitignore` chặn không cho commit).
- Telegram gọi vào kèm mật khẩu webhook riêng cho từng bot; ai gọi thẳng vào địa chỉ Worker
  mà không có mật khẩu đó thì bị từ chối.
- Chữ trong ảnh, trong file, trong tin người lạ chuyển tiếp đều được bọc lại và dặn AI coi là
  **dữ liệu chứ không phải mệnh lệnh** — chống kiểu tấn công giấu chỉ thị trong ảnh.
- Mọi tin nhắn gửi ra đều đi qua bộ lọc xoá những thứ trông giống khoá bí mật.
- Nếu repo của bạn để công khai, nhớ rằng `bots/*.yaml` có persona và chat id — nên để repo
  **private**.

---

## Gặp trục trặc?

| Hiện tượng | Cách xử lý |
|---|---|
| Bot không trả lời | `npx wrangler tail` để xem log trực tiếp; kiểm tra `https://<worker>.workers.dev/health` |
| Nhắn mà im ru | Sai webhook — chạy `npm run webhook`; hoặc bạn không nằm trong danh sách được phép |
| "Mình đang trục trặc kết nối với bộ não" | Khoá AI sai/hết lượt — `npx wrangler secret put GEMINI_API_KEY` |
| Lịch không chạy | Cron chỉ chạy khi Worker đã deploy thật; kiểm tra `[triggers]` trong `wrangler.toml` |
| Sửa YAML mà bot không đổi | Phải `npm run deploy` (cấu hình được đóng gói vào Worker lúc build) |

---

## Giấy phép

MIT — dùng thoải mái, sửa thoải mái.
