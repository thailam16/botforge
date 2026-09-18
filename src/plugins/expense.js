// Plugin SỔ CHI TIÊU + VIỆC CẦN LÀM (kiểu Bơ / Lisa):
// nhắn "trưa nay ăn phở 45k" là ghi sổ, "nhớ mua sữa" là thêm việc.
import { today, shiftDate } from '../core/time.js';

const CATEGORIES = ['Ăn uống', 'Đi lại', 'Chợ búa', 'Hoá đơn', 'Sức khoẻ', 'Giải trí', 'Mua sắm', 'Khác'];

export default {
  name: 'expense',
  label: 'Sổ chi tiêu & việc cần làm',

  dataKinds: [
    {
      kind: 'expense',
      doc:
        `{"kind":"expense","date":"YYYY-MM-DD","title":"ăn phở","amount":45000,"category":"${CATEGORIES[0]}","payer":"tên người chi","note":""} ` +
        `— "amount" là số VNĐ đầy đủ ("45k" -> 45000). "category" chọn trong: ${CATEGORIES.join(' / ')}. Hoá đơn nhiều món thì mỗi món một dòng.`,
    },
    { kind: 'todo', doc: '{"kind":"todo","text":"việc cần làm","due":"YYYY-MM-DD"} — "due" không bắt buộc.' },
    { kind: 'todo_done', doc: '{"kind":"todo_done","id":4} — đánh dấu xong hoặc bỏ một việc trong danh sách đang chờ.' },
  ],

  async promptBlock({ store, chatId, tz }) {
    const d = today(tz);
    const month = d.slice(0, 7);
    const sum = await store.first(
      "SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE bot=? AND chat_id=? AND substr(date,1,7)=?",
      store.bot, String(chatId), month,
    );
    const dayRows = await store.all(
      'SELECT title, amount FROM expenses WHERE bot=? AND chat_id=? AND date=? ORDER BY id',
      store.bot, String(chatId), d,
    );
    const todos = await store.all(
      'SELECT id, text, due FROM todos WHERE bot=? AND chat_id=? AND done=0 ORDER BY id LIMIT 20',
      store.bot, String(chatId),
    );
    const parts = [
      `CHI TIÊU: hôm nay (${d}) đã ghi ${dayRows.length} khoản${dayRows.length ? ` (${dayRows.map((r) => `${r.title} ${money(r.amount)}`).join(', ')})` : ''}. Tháng ${month} tổng ${money(sum?.total || 0)}.`,
      `Các nhóm chi hợp lệ: ${CATEGORIES.join(' / ')}.`,
    ];
    if (todos.length) {
      parts.push(`VIỆC ĐANG CHỜ (đừng bịa thêm việc ngoài danh sách này):\n${todos.map((t) => `#${t.id} ${t.text}${t.due ? ` (hạn ${t.due})` : ''}`).join('\n')}`);
    }
    return parts.join('\n');
  },

  async applyData({ store, chatId, tz }, item) {
    const d = item.date || today(tz);
    if (item.kind === 'expense' && item.amount) {
      await store.run(
        'INSERT INTO expenses (bot, chat_id, date, payer, title, amount, category, note) VALUES (?,?,?,?,?,?,?,?)',
        store.bot, String(chatId), d, item.payer || null, item.title || 'Chi tiêu',
        Number(item.amount) || 0, item.category || 'Khác', item.note || null,
      );
      return { expenseDate: d };
    }
    if (item.kind === 'todo' && item.text) {
      const r = await store.run(
        'INSERT INTO todos (bot, chat_id, text, due) VALUES (?,?,?,?)',
        store.bot, String(chatId), String(item.text).slice(0, 300), item.due || null,
      );
      return `📝 Đã thêm việc #${r.meta?.last_row_id}: ${item.text}`;
    }
    if (item.kind === 'todo_done' && item.id) {
      await store.run('UPDATE todos SET done=1 WHERE bot=? AND chat_id=? AND id=?', store.bot, String(chatId), item.id);
      return `✅ Đã xong việc #${item.id}.`;
    }
    return null;
  },

  async footer(ctx, info) {
    if (!info?.expenseDate) return null;
    return dayExpense(ctx, info.expenseDate);
  },

  commands: {
    '/chi': { desc: 'Chi tiêu hôm nay', run: (ctx) => dayExpense(ctx, today(ctx.tz)) },
    '/thang': {
      desc: 'Chi tiêu tháng này theo nhóm',
      async run({ store, chatId, tz }) {
        const month = today(tz).slice(0, 7);
        const rows = await store.all(
          "SELECT category, SUM(amount) total, COUNT(*) n FROM expenses WHERE bot=? AND chat_id=? AND substr(date,1,7)=? GROUP BY category ORDER BY total DESC",
          store.bot, String(chatId), month,
        );
        if (!rows.length) return `Tháng ${month} chưa ghi khoản nào.`;
        const total = rows.reduce((a, r) => a + r.total, 0);
        return [`💰 Chi tiêu tháng ${month}`, ...rows.map((r) => `• ${r.category}: ${money(r.total)} (${r.n} khoản)`), '', `Tổng: ${money(total)}`].join('\n');
      },
    },
    '/viec': {
      desc: 'Danh sách việc cần làm',
      async run({ store, chatId }) {
        const rows = await store.all('SELECT id, text, due FROM todos WHERE bot=? AND chat_id=? AND done=0 ORDER BY id', store.bot, String(chatId));
        if (!rows.length) return '📝 Không còn việc nào đang chờ.';
        return ['📝 Việc cần làm:', ...rows.map((r) => `#${r.id} • ${r.text}${r.due ? ` (hạn ${r.due})` : ''}`)].join('\n');
      },
    },
    '/xong': {
      desc: 'Đánh dấu xong việc, ví dụ /xong 3',
      async run({ store, chatId, args }) {
        const id = Number(args);
        if (!id) return 'Gõ kèm số việc nhé, ví dụ: /xong 3';
        const r = await store.run('UPDATE todos SET done=1 WHERE bot=? AND chat_id=? AND id=?', store.bot, String(chatId), id);
        return r.meta?.changes ? `✅ Xong việc #${id}!` : `Không tìm thấy việc #${id}.`;
      },
    },
  },

  jobs: [
    {
      id: 'expense-checkin',
      atFromConfig: 'ask_expense_at',
      at: '21:30',
      perUser: true,
      async run({ store, chatId, tz }) {
        const d = today(tz);
        const row = await store.first('SELECT COUNT(*) n FROM expenses WHERE bot=? AND chat_id=? AND date=?', store.bot, String(chatId), d);
        if (row?.n) return null; // hôm nay đã ghi rồi thì im lặng
        return '💰 Hôm nay bạn có chi khoản nào không? Nhắn mình ghi sổ giúp nhé.';
      },
    },
    {
      id: 'expense-weekly',
      atFromConfig: 'weekly_report',
      at: '20:00',
      weekday: 0,
      perUser: true,
      async run({ store, chatId, tz }) {
        const to = today(tz);
        const from = shiftDate(to, -6);
        const rows = await store.all(
          'SELECT category, SUM(amount) total FROM expenses WHERE bot=? AND chat_id=? AND date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC',
          store.bot, String(chatId), from, to,
        );
        if (!rows.length) return null;
        const total = rows.reduce((a, r) => a + r.total, 0);
        return [`💰 Tuần ${from} → ${to}`, ...rows.map((r) => `• ${r.category}: ${money(r.total)}`), '', `Tổng: ${money(total)}`].join('\n');
      },
    },
  ],
};

async function dayExpense({ store, chatId }, date) {
  const rows = await store.all('SELECT title, amount, category FROM expenses WHERE bot=? AND chat_id=? AND date=? ORDER BY id', store.bot, String(chatId), date);
  if (!rows.length) return `Ngày ${date} chưa ghi khoản chi nào.`;
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return [`💰 Chi ngày ${date}`, ...rows.map((r) => `• ${r.title} — ${money(r.amount)} (${r.category})`), '', `Tổng: ${money(total)}`].join('\n');
}

export function money(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
}
