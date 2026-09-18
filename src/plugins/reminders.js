// Plugin NHẮC VIỆC: người dùng nói "9h sáng mai nhắc tôi họp" là bot tự đặt lịch.
import { localToUtc, formatLocal, localParts } from '../core/time.js';

export default {
  name: 'reminders',
  label: 'Nhắc việc & lịch chủ động',

  dataKinds: [
    {
      kind: 'reminder',
      doc:
        '{"kind":"reminder","text":"nội dung nhắc","at":"YYYY-MM-DD HH:MM","repeat":"none|daily|weekly|monthly","days":[1,2,3,4,5]} ' +
        '— "at" là giờ ĐỊA PHƯƠNG của người dùng, luôn ghi tường minh (suy ra từ "mai", "thứ 2 tới"…). "days" chỉ dùng khi repeat=daily và chỉ muốn nhắc vài thứ trong tuần (0=CN…6=T7).',
    },
    {
      kind: 'reminder_done',
      doc: '{"kind":"reminder_done","id":12} — huỷ / đánh dấu xong một lời nhắc mà người dùng vừa nhắc tới.',
    },
  ],

  async promptBlock({ store, chatId, tz }) {
    const rows = await store.all(
      'SELECT id, text, due_at, repeat FROM reminders WHERE bot=? AND chat_id=? AND done=0 ORDER BY due_at LIMIT 15',
      store.bot, String(chatId),
    );
    if (!rows.length) return '';
    const lines = rows.map((r) => `#${r.id} — ${r.text} (lúc ${formatLocal(tz, new Date(r.due_at))}${r.repeat !== 'none' ? `, lặp ${r.repeat}` : ''})`);
    return `LỜI NHẮC ĐANG CHỜ\n${lines.join('\n')}`;
  },

  async applyData({ store, chatId, tz }, item) {
    if (item.kind === 'reminder' && item.text && item.at) {
      const due = localToUtc(tz, item.at);
      if (!due || Number.isNaN(due.getTime())) return null;
      await store.run(
        'INSERT INTO reminders (bot, chat_id, text, due_at, repeat, days) VALUES (?,?,?,?,?,?)',
        store.bot, String(chatId), String(item.text).slice(0, 500),
        due.toISOString(), item.repeat || 'none',
        Array.isArray(item.days) ? JSON.stringify(item.days) : null,
      );
      return `⏰ Đã đặt nhắc: ${item.text} — ${formatLocal(tz, due)}`;
    }
    if (item.kind === 'reminder_done' && item.id) {
      await store.run('UPDATE reminders SET done=1 WHERE bot=? AND chat_id=? AND id=?', store.bot, String(chatId), item.id);
      return null;
    }
    return null;
  },

  commands: {
    '/nhac': {
      desc: 'Xem các lời nhắc đang chờ',
      async run({ store, chatId, tz }) {
        const rows = await store.all(
          'SELECT id, text, due_at, repeat FROM reminders WHERE bot=? AND chat_id=? AND done=0 ORDER BY due_at LIMIT 30',
          store.bot, String(chatId),
        );
        if (!rows.length) return '⏰ Không có lời nhắc nào đang chờ.';
        return ['⏰ Lời nhắc đang chờ:', ...rows.map((r) =>
          `#${r.id} • ${formatLocal(tz, new Date(r.due_at))} — ${r.text}${r.repeat !== 'none' ? ` (lặp ${r.repeat})` : ''}`)].join('\n');
      },
    },
    '/xoanhac': {
      desc: 'Xoá lời nhắc theo số, ví dụ /xoanhac 3',
      async run({ store, chatId, args }) {
        const id = Number(args);
        if (!id) return 'Bạn gõ kèm số nhé, ví dụ: /xoanhac 3';
        const r = await store.run('UPDATE reminders SET done=1 WHERE bot=? AND chat_id=? AND id=?', store.bot, String(chatId), id);
        return r.meta?.changes ? `✅ Đã xoá lời nhắc #${id}.` : `Không tìm thấy lời nhắc #${id}.`;
      },
    },
  },

  jobs: [
    {
      id: 'due-reminders',
      everyTick: true, // chạy mỗi lần cron đập, không theo mốc giờ
      ignoreQuietHours: false,
      async run({ store, tz, now }) {
        const rows = await store.all(
          'SELECT * FROM reminders WHERE bot=? AND done=0 AND due_at<=? ORDER BY due_at LIMIT 20',
          store.bot, now.toISOString(),
        );
        const out = [];
        for (const r of rows) {
          const days = r.days ? JSON.parse(r.days) : null;
          const wd = localParts(tz, new Date(r.due_at)).weekday;
          const skip = days && !days.includes(wd);
          if (!skip) out.push({ chatId: r.chat_id, text: `⏰ Nhắc bạn: ${r.text}` });
          const next = nextDue(new Date(r.due_at), r.repeat);
          if (next) {
            await store.run('UPDATE reminders SET due_at=? WHERE id=?', next.toISOString(), r.id);
          } else {
            await store.run('UPDATE reminders SET done=1 WHERE id=?', r.id);
          }
        }
        return out;
      },
    },
  ],
};

export function nextDue(date, repeat) {
  const d = new Date(date);
  if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (repeat === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else return null;
  // Lời nhắc quá hạn lâu (bot ngủ) thì đẩy tới mốc kế tiếp trong tương lai
  const now = Date.now();
  let guard = 0;
  while (d.getTime() <= now && guard++ < 400) {
    if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1);
    else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d;
}
