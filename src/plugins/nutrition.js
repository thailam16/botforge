// Plugin DINH DƯỠNG (kiểu PT Nger): gửi ảnh bữa ăn -> ước lượng calo/macro,
// cộng dồn theo ngày, theo dõi cân nặng & buổi tập.
// Nguyên tắc: LLM chỉ NHẬN DIỆN món ăn; mọi phép cộng và chỉ số BMR/TDEE do code tính.
import { today, shiftDate, localParts } from '../core/time.js';
import { safeJson } from '../core/db.js';

export default {
  name: 'nutrition',
  label: 'Theo dõi dinh dưỡng & tập luyện',

  dataKinds: [
    {
      kind: 'meal',
      doc:
        '{"kind":"meal","date":"YYYY-MM-DD","slot":"sang|trua|toi|phu","title":"tên bữa",' +
        '"items":[{"name":"cơm trắng","qty":"1 chén","kcal":200,"protein":4,"carb":44,"fat":0.4}]} ' +
        '— "date" là ngày ăn THẬT (suy từ "tối qua", "sáng nay"), luôn ghi tường minh. Ước lượng theo khẩu phần nhìn thấy; thiếu định lượng thì hỏi lại trước khi ghi.',
    },
    {
      kind: 'workout',
      doc: '{"kind":"workout","date":"YYYY-MM-DD","kind_name":"chạy bộ","minutes":30,"kcal_burn":280,"note":""}',
    },
    {
      kind: 'body',
      doc: '{"kind":"body","date":"YYYY-MM-DD","weight_kg":70.5,"body_fat":18,"muscle_kg":32} — chỉ ghi chỉ số người dùng tự báo hoặc đọc được từ ảnh cân/InBody.',
    },
    {
      kind: 'profile',
      doc:
        '{"kind":"profile","sex":"nam|nu","age":30,"height_cm":170,"weight_kg":70,"activity":"it|nhe|vua|nhieu|rat_nhieu","goal":"giam|giu|tang"} ' +
        '— ghi khi người dùng cung cấp hồ sơ. KHÔNG tự tính calo mục tiêu, hệ thống sẽ tự tính.',
    },
  ],

  async promptBlock(ctx) {
    const { store, chatId, tz } = ctx;
    const d = today(tz);
    const profile = safeJson((await store.getUser(chatId))?.profile) || {};
    const parts = [];

    if (profile.targets) {
      const t = profile.targets;
      parts.push(
        `HỒ SƠ NGƯỜI DÙNG: ${profile.sex === 'nu' ? 'nữ' : 'nam'}, ${profile.age} tuổi, ${profile.height_cm}cm, ${profile.weight_kg}kg, vận động "${profile.activity}", mục tiêu "${profile.goal}".\n` +
        `CHỈ TIÊU MỖI NGÀY (hệ thống đã tính, dùng đúng số này): ${t.kcal} kcal • đạm ${t.protein}g • tinh bột ${t.carb}g • béo ${t.fat}g (BMR ${t.bmr}, TDEE ${t.tdee}).`,
      );
    } else {
      parts.push('HỒ SƠ: chưa có. Hãy hỏi tự nhiên để thu thập: giới tính, tuổi, chiều cao, cân nặng, mức vận động, mục tiêu — rồi ghi BOT_DATA profile.');
    }

    const sum = await dayTotals(store, chatId, d);
    parts.push(`HÔM NAY (${d}) ĐÃ ĂN: ${sum.kcal} kcal • đạm ${sum.protein}g • tinh bột ${sum.carb}g • béo ${sum.fat}g (${sum.meals} bữa).`);

    const foods = await store.all(
      `SELECT mi.name, ROUND(AVG(mi.kcal)) kcal FROM meal_items mi
       JOIN meals m ON m.id = mi.meal_id
       WHERE m.bot=? AND m.chat_id=? GROUP BY LOWER(mi.name) ORDER BY COUNT(*) DESC LIMIT 15`,
      store.bot, String(chatId),
    );
    if (foods.length) {
      parts.push(`MÓN NGƯỜI NÀY HAY ĂN (dùng lại mức calo cũ cho nhất quán): ${foods.map((f) => `${f.name} ~${f.kcal}kcal`).join('; ')}`);
    }

    const body = await store.first(
      'SELECT * FROM body_log WHERE bot=? AND chat_id=? ORDER BY date DESC LIMIT 1',
      store.bot, String(chatId),
    );
    if (body) {
      parts.push(`CHỈ SỐ CƠ THỂ GẦN NHẤT (${body.date}): ${[body.weight_kg && `${body.weight_kg}kg`, body.body_fat && `mỡ ${body.body_fat}%`, body.muscle_kg && `cơ ${body.muscle_kg}kg`].filter(Boolean).join(' • ')}`);
    }
    return parts.join('\n');
  },

  async applyData(ctx, item) {
    const { store, chatId, tz } = ctx;
    const d = item.date || today(tz);

    if (item.kind === 'meal') {
      const items = Array.isArray(item.items) ? item.items : [];
      const tot = sumItems(items);
      const res = await store.run(
        'INSERT INTO meals (bot, chat_id, date, time, slot, title, kcal, protein, carb, fat, note, photo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        store.bot, String(chatId), d, localParts(tz).hhmm, item.slot || null, item.title || 'Bữa ăn',
        tot.kcal, tot.protein, tot.carb, tot.fat, item.note || null, ctx.photoKey || null,
      );
      const mealId = res.meta?.last_row_id;
      for (const it of items) {
        await store.run(
          'INSERT INTO meal_items (meal_id, name, qty, kcal, protein, carb, fat) VALUES (?,?,?,?,?,?,?)',
          mealId, it.name || '?', it.qty || '', num(it.kcal), num(it.protein), num(it.carb), num(it.fat),
        );
      }
      return { footerDate: d };
    }

    if (item.kind === 'workout') {
      await store.run(
        'INSERT INTO workouts (bot, chat_id, date, kind, minutes, kcal_burn, note) VALUES (?,?,?,?,?,?,?)',
        store.bot, String(chatId), d, item.kind_name || 'tập', num(item.minutes), num(item.kcal_burn), item.note || null,
      );
      return { footerDate: d };
    }

    if (item.kind === 'body') {
      await store.run(
        'INSERT INTO body_log (bot, chat_id, date, weight_kg, body_fat, muscle_kg, note) VALUES (?,?,?,?,?,?,?)',
        store.bot, String(chatId), d, num(item.weight_kg) || null, num(item.body_fat) || null, num(item.muscle_kg) || null, item.note || null,
      );
      return null;
    }

    if (item.kind === 'profile') {
      const cur = safeJson((await store.getUser(chatId))?.profile) || {};
      const next = { ...cur, ...pick(item, ['sex', 'age', 'height_cm', 'weight_kg', 'activity', 'goal']) };
      if (next.sex && next.age && next.height_cm && next.weight_kg) next.targets = computeTargets(next);
      await store.setProfile(chatId, next);
      if (next.targets) {
        const t = next.targets;
        return `📋 Hồ sơ đã cập nhật — chỉ tiêu mỗi ngày: ${t.kcal} kcal • đạm ${t.protein}g • tinh bột ${t.carb}g • béo ${t.fat}g`;
      }
      return null;
    }
    return null;
  },

  /** Bảng luỹ kế gửi kèm sau mỗi lần ghi bữa ăn. */
  async footer(ctx, info) {
    const d = info?.footerDate || today(ctx.tz);
    return dayBoard(ctx, d);
  },

  commands: {
    '/homnay': { desc: 'Tổng kết hôm nay', run: (ctx) => dayBoard(ctx, today(ctx.tz)) },
    '/homqua': { desc: 'Tổng kết hôm qua', run: (ctx) => dayBoard(ctx, shiftDate(today(ctx.tz), -1)) },
    '/tuan': { desc: 'Tổng kết 7 ngày', run: (ctx) => weekBoard(ctx) },
    '/hoso': {
      desc: 'Xem hồ sơ & chỉ tiêu',
      async run({ store, chatId }) {
        const p = safeJson((await store.getUser(chatId))?.profile) || {};
        if (!p.targets) return 'Bạn chưa có hồ sơ. Nhắn cho mình giới tính, tuổi, chiều cao, cân nặng, mức vận động và mục tiêu nhé.';
        const t = p.targets;
        return [
          '📋 Hồ sơ của bạn',
          `• ${p.sex === 'nu' ? 'Nữ' : 'Nam'}, ${p.age} tuổi, ${p.height_cm}cm, ${p.weight_kg}kg`,
          `• Vận động: ${p.activity} — Mục tiêu: ${p.goal}`,
          `• BMR ${t.bmr} kcal • TDEE ${t.tdee} kcal`,
          `• Chỉ tiêu/ngày: ${t.kcal} kcal • đạm ${t.protein}g • tinh bột ${t.carb}g • béo ${t.fat}g`,
        ].join('\n');
      },
    },
    '/cannang': {
      desc: 'Lịch sử cân nặng',
      async run({ store, chatId }) {
        const rows = await store.all(
          'SELECT date, weight_kg, body_fat FROM body_log WHERE bot=? AND chat_id=? AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 15',
          store.bot, String(chatId),
        );
        if (!rows.length) return 'Chưa có số cân nào. Nhắn "hôm nay 70kg" là mình ghi lại.';
        const delta = rows.length > 1 ? rows[0].weight_kg - rows[rows.length - 1].weight_kg : 0;
        return ['⚖️ Cân nặng gần đây:', ...rows.map((r) => `• ${r.date}: ${r.weight_kg}kg${r.body_fat ? ` (mỡ ${r.body_fat}%)` : ''}`),
          rows.length > 1 ? `\nThay đổi so với ${rows[rows.length - 1].date}: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}kg` : ''].join('\n');
      },
    },
    '/huy': {
      desc: 'Xoá bản ghi vừa lưu gần nhất',
      async run({ store, chatId }) {
        const meal = await store.first('SELECT id, title, date FROM meals WHERE bot=? AND chat_id=? ORDER BY id DESC LIMIT 1', store.bot, String(chatId));
        if (!meal) return 'Không có bản ghi nào để huỷ.';
        await store.run('DELETE FROM meal_items WHERE meal_id=?', meal.id);
        await store.run('DELETE FROM meals WHERE id=?', meal.id);
        return `🗑 Đã xoá bữa "${meal.title}" ngày ${meal.date}.`;
      },
    },
  },

  jobs: [
    {
      id: 'meal-reminder',
      atListFromConfig: 'remind_meals',
      perUser: true,
      async run({ store, chatId, tz }) {
        const sum = await dayTotals(store, chatId, today(tz));
        if (sum.meals > 0 && localParts(tz).hour < 15) return null; // trưa mà đã ghi rồi thì thôi
        return sum.meals === 0
          ? '🍚 Bữa vừa rồi bạn ăn gì thế? Gửi mình ảnh hoặc mô tả nhé.'
          : '🍚 Bữa này ăn gì rồi bạn? Gửi mình để ghi vào nhật ký nha.';
      },
    },
    {
      id: 'daily-summary',
      atFromConfig: 'daily_summary',
      at: '21:30',
      perUser: true,
      async run(ctx) {
        const d = today(ctx.tz);
        const sum = await dayTotals(ctx.store, ctx.chatId, d);
        if (!sum.meals && !sum.burn) return null;
        const board = await dayBoard(ctx, d);
        const advice = await ctx.llm
          .chat({
            system: `${ctx.persona}\n\nViết 3-4 câu nhận xét ngắn về ngày ăn uống của người dùng: khen điểm tốt, chỉ 1 điểm cần sửa, gợi ý cho ngày mai. Không lặp lại bảng số.`,
            messages: [{ role: 'user', text: board }],
            maxTokens: 400,
          })
          .then((r) => r.text)
          .catch(() => '');
        return `${board}${advice ? `\n\n${advice}` : ''}`;
      },
    },
    {
      id: 'weekly-report',
      atFromConfig: 'weekly_report',
      at: '20:30',
      weekday: 0, // Chủ nhật
      perUser: true,
      async run(ctx) {
        const board = await weekBoard(ctx);
        const advice = await ctx.llm
          .chat({
            system: `${ctx.persona}\n\nViết báo cáo tuần gồm 3 phần ngắn: Thống kê (1-2 câu), Nhận xét, Lời khuyên cho tuần tới (dinh dưỡng + tập luyện). Dựa đúng số liệu được cho, không bịa thêm.`,
            messages: [{ role: 'user', text: board }],
            maxTokens: 700,
          })
          .then((r) => r.text)
          .catch(() => '');
        return `📅 BÁO CÁO TUẦN\n${board}${advice ? `\n\n${advice}` : ''}`;
      },
    },
  ],
};

// ── Tính toán (code làm, không để LLM tự cộng) ───────────────────

export function computeTargets(p) {
  const s = p.sex === 'nu' ? -161 : 5;
  const bmr = Math.round(10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + s);
  const factor = { it: 1.2, nhe: 1.375, vua: 1.55, nhieu: 1.725, rat_nhieu: 1.9 }[p.activity] ?? 1.375;
  const tdee = Math.round(bmr * factor);
  const adjust = { giam: -0.2, tang: 0.12, giu: 0 }[p.goal] ?? 0;
  const kcal = Math.round(tdee * (1 + adjust));
  const protein = Math.round(p.weight_kg * (p.goal === 'giam' ? 2.0 : 1.7));
  const fat = Math.round((kcal * 0.25) / 9);
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr, tdee, kcal, protein, carb, fat };
}

export function sumItems(items) {
  return items.reduce(
    (a, it) => ({
      kcal: a.kcal + num(it.kcal),
      protein: a.protein + num(it.protein),
      carb: a.carb + num(it.carb),
      fat: a.fat + num(it.fat),
    }),
    { kcal: 0, protein: 0, carb: 0, fat: 0 },
  );
}

async function dayTotals(store, chatId, date) {
  const m = await store.first(
    'SELECT COUNT(*) n, COALESCE(SUM(kcal),0) kcal, COALESCE(SUM(protein),0) protein, COALESCE(SUM(carb),0) carb, COALESCE(SUM(fat),0) fat FROM meals WHERE bot=? AND chat_id=? AND date=?',
    store.bot, String(chatId), date,
  );
  const w = await store.first(
    'SELECT COALESCE(SUM(kcal_burn),0) burn, COALESCE(SUM(minutes),0) mins FROM workouts WHERE bot=? AND chat_id=? AND date=?',
    store.bot, String(chatId), date,
  );
  return {
    meals: m?.n || 0,
    kcal: Math.round(m?.kcal || 0),
    protein: Math.round(m?.protein || 0),
    carb: Math.round(m?.carb || 0),
    fat: Math.round(m?.fat || 0),
    burn: Math.round(w?.burn || 0),
    mins: Math.round(w?.mins || 0),
  };
}

async function dayBoard(ctx, date) {
  const { store, chatId } = ctx;
  const sum = await dayTotals(store, chatId, date);
  const t = (safeJson((await store.getUser(chatId))?.profile) || {}).targets;
  const rows = await store.all('SELECT title, kcal, slot FROM meals WHERE bot=? AND chat_id=? AND date=? ORDER BY id', store.bot, String(chatId), date);
  const lines = [`📊 Ngày ${date}`];
  if (rows.length) lines.push(...rows.map((r) => `• ${r.title} — ${Math.round(r.kcal)} kcal`));
  else lines.push('• (chưa ghi bữa nào)');
  lines.push('');
  lines.push(bar('Calo', sum.kcal, t?.kcal, 'kcal'));
  lines.push(bar('Đạm', sum.protein, t?.protein, 'g'));
  lines.push(bar('Tinh bột', sum.carb, t?.carb, 'g'));
  lines.push(bar('Béo', sum.fat, t?.fat, 'g'));
  if (sum.burn) lines.push(`🔥 Vận động: ${sum.mins} phút, đốt ~${sum.burn} kcal`);
  if (t) {
    const net = sum.kcal - sum.burn - t.kcal;
    lines.push(net > 0 ? `➡️ Vượt chỉ tiêu ${Math.round(net)} kcal` : `➡️ Còn dư ${Math.abs(Math.round(net))} kcal`);
  }
  return lines.join('\n');
}

async function weekBoard(ctx) {
  const { store, chatId, tz } = ctx;
  const to = today(tz);
  const from = shiftDate(to, -6);
  const days = await store.all(
    'SELECT date, SUM(kcal) kcal, SUM(protein) protein FROM meals WHERE bot=? AND chat_id=? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date',
    store.bot, String(chatId), from, to,
  );
  const w = await store.first(
    'SELECT COALESCE(SUM(kcal_burn),0) burn, COALESCE(SUM(minutes),0) mins, COUNT(*) n FROM workouts WHERE bot=? AND chat_id=? AND date BETWEEN ? AND ?',
    store.bot, String(chatId), from, to,
  );
  const t = (safeJson((await store.getUser(chatId))?.profile) || {}).targets;
  const totalKcal = days.reduce((a, d) => a + (d.kcal || 0), 0);
  const lines = [`📆 Tuần ${from} → ${to}`];
  lines.push(...days.map((d) => `• ${d.date}: ${Math.round(d.kcal || 0)} kcal`));
  if (!days.length) lines.push('• (chưa ghi bữa nào trong tuần)');
  lines.push('');
  lines.push(`Tổng nạp: ${Math.round(totalKcal)} kcal — trung bình ${days.length ? Math.round(totalKcal / days.length) : 0} kcal/ngày`);
  lines.push(`Tập luyện: ${w?.n || 0} buổi, ${Math.round(w?.mins || 0)} phút, đốt ~${Math.round(w?.burn || 0)} kcal`);
  if (t) {
    const balance = totalKcal - (w?.burn || 0) - t.tdee * 7;
    lines.push(balance < 0 ? `Cân bằng năng lượng: thâm hụt ${Math.abs(Math.round(balance))} kcal cả tuần` : `Cân bằng năng lượng: thặng dư ${Math.round(balance)} kcal cả tuần`);
  }
  return lines.join('\n');
}

function bar(label, value, target, unit) {
  if (!target) return `${label}: ${value}${unit}`;
  const pct = Math.min(100, Math.round((value / target) * 100));
  const filled = Math.round(pct / 10);
  return `${label}: ${value}/${target}${unit} ${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}%`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
}
