// Chạy thử trọn vẹn một lượt chat: Telegram -> LLM (giả) -> ghi CSDL -> trả lời.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleUpdate } from '../src/core/runtime.js';
import { runSchedules } from '../src/core/scheduler.js';
import { makeD1, makeEnv, testBot, stubNetwork, tgMessage } from './helpers.mjs';

async function chat(update, { bot = testBot(), llmReply = 'ok', llmError = null, env } = {}) {
  const net = stubNetwork({ llmReply, llmError });
  const e = env || makeEnv(makeD1());
  try {
    await handleUpdate(update, bot, e);
  } finally {
    net.restore();
  }
  return { ...net, env: e };
}

test('tin nhắn thường: bot trả lời và nhớ lại hội thoại', async () => {
  const env = makeEnv(makeD1());
  const { sent } = await chat(tgMessage('chào bạn'), { llmReply: 'Chào Lâm nhé!', env });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, 'Chào Lâm nhé!');

  const rows = env.DB._raw.prepare('SELECT role, content FROM messages ORDER BY id').all();
  assert.deepEqual(rows.map((r) => r.role), ['user', 'assistant']);
  const user = env.DB._raw.prepare('SELECT * FROM users').get();
  assert.equal(user.role, 'owner', 'người nhắn đầu tiên trở thành chủ bot');
});

test('ghi bữa ăn: dữ liệu vào CSDL, bảng luỹ kế gửi kèm, dòng BOT_DATA không lọt ra', async () => {
  const env = makeEnv(makeD1());
  const reply = [
    'Bữa trưa của bạn khoảng 520 kcal nha.',
    'BOT_DATA: {"kind":"meal","date":"2026-09-19","slot":"trua","title":"Cơm gà","items":[{"name":"cơm","qty":"1 chén","kcal":200,"protein":4,"carb":44,"fat":0.4},{"name":"gà","qty":"100g","kcal":320,"protein":30,"carb":0,"fat":20}]}',
  ].join('\n');
  const { sent } = await chat(tgMessage('trưa nay ăn cơm gà'), { llmReply: reply, env });

  const meal = env.DB._raw.prepare('SELECT * FROM meals').get();
  assert.equal(meal.title, 'Cơm gà');
  assert.equal(Math.round(meal.kcal), 520);
  assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM meal_items').get().n, 2);

  assert.ok(sent.every((m) => !m.text.includes('BOT_DATA')), 'không được lộ dòng giao thức');
  assert.ok(sent.some((m) => m.text.includes('Cơm gà') && m.text.includes('520')), 'phải gửi bảng luỹ kế');
});

test('hồ sơ: chỉ tiêu do code tính, không nghe số LLM bịa', async () => {
  const env = makeEnv(makeD1());
  const reply = 'Ghi nhận nhé!\nBOT_DATA: {"kind":"profile","sex":"nam","age":32,"height_cm":172,"weight_kg":72,"activity":"nhe","goal":"giam"}';
  const { sent } = await chat(tgMessage('mình nam 32 tuổi 172cm 72kg ít vận động muốn giảm cân'), { llmReply: reply, env });
  const profile = JSON.parse(env.DB._raw.prepare('SELECT profile FROM users').get().profile);
  assert.equal(profile.targets.bmr, 1640);
  assert.ok(sent.some((m) => m.text.includes('1804')), 'phải báo chỉ tiêu đã tính');
});

test('ghi chi tiêu và việc cần làm', async () => {
  const env = makeEnv(makeD1());
  const reply = [
    'Ghi rồi nha.',
    'BOT_DATA: {"kind":"expense","date":"2026-09-19","title":"ăn phở","amount":45000,"category":"Ăn uống"}',
    'BOT_DATA: {"kind":"todo","text":"mua sữa"}',
  ].join('\n');
  const { sent } = await chat(tgMessage('trưa nay ăn phở 45k, nhớ mua sữa'), { llmReply: reply, env });
  assert.equal(env.DB._raw.prepare('SELECT amount FROM expenses').get().amount, 45000);
  assert.equal(env.DB._raw.prepare('SELECT text FROM todos').get().text, 'mua sữa');
  assert.ok(sent.some((m) => m.text.includes('45.000đ')), 'số tiền phải hiển thị kiểu Việt Nam');
});

test('lệnh /help và /status trả lời ngay, không gọi LLM', async () => {
  const env = makeEnv(makeD1());
  const { sent, calls } = await chat(tgMessage('/help'), { env });
  assert.ok(sent[0].text.includes('/homnay'));
  assert.ok(!calls.some((c) => c.url.includes('generativelanguage')), 'lệnh không được tốn tiền gọi AI');

  const s = await chat(tgMessage('/status'), { env });
  assert.match(s.sent[0].text, /đang chạy/);
});

test('người lạ bị lờ đi, nhóm lạ thì tự rời', async () => {
  const bot = testBot({ access: { mode: 'whitelist', users: [{ chat_id: '999', name: 'Chủ' }], groups: [] } });
  const stranger = await chat(tgMessage('cho tôi hỏi'), { bot });
  assert.equal(stranger.sent.length, 0);

  const group = await chat(tgMessage('bot ơi', { chat: { id: -100123, type: 'supergroup' } }), { bot });
  assert.ok(group.calls.some((c) => c.url.includes('leaveChat')), 'phải rời nhóm lạ');
});

test('LLM hỏng: báo người dùng bằng tiếng Việt, không văng lỗi kỹ thuật', async () => {
  const { sent } = await chat(tgMessage('chào'), { llmError: { message: 'boom', status: 500 } });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /trục trặc/);
  assert.ok(!sent[0].text.includes('boom'));
});

test('lịch chủ động: lời nhắc tới hạn thì bắn, giờ yên tĩnh thì im', async () => {
  const env = makeEnv(makeD1());
  const bot = testBot();
  const reply = 'Ok mình nhắc nhé.\nBOT_DATA: {"kind":"reminder","text":"họp team","at":"2026-09-19 09:00","repeat":"none"}';
  await chat(tgMessage('9h sáng mai nhắc tôi họp team'), { llmReply: reply, env, bot });
  const r = env.DB._raw.prepare('SELECT * FROM reminders').get();
  assert.equal(r.text, 'họp team');
  assert.equal(r.due_at, '2026-09-19T02:00:00.000Z');

  const quiet = stubNetwork({});
  await runSchedules(bot, env, new Date('2026-09-19T17:10:00Z')); // 0h10 giờ VN
  quiet.restore();
  assert.equal(quiet.sent.length, 0, 'giờ yên tĩnh không được nhắn');

  const awake = stubNetwork({});
  await runSchedules(bot, env, new Date('2026-09-19T03:00:00Z')); // 10h sáng VN
  awake.restore();
  assert.ok(awake.sent.some((m) => m.text.includes('họp team')), 'tới giờ phải nhắc');
  assert.equal(env.DB._raw.prepare('SELECT done FROM reminders').get().done, 1);
});

test('lịch chủ động: mỗi mốc giờ chỉ chạy một lần trong ngày', async () => {
  const env = makeEnv(makeD1());
  const bot = testBot({ plugins: { expense: { enabled: true, ask_expense_at: '21:30' } } });
  env.DB._raw.prepare("INSERT INTO users (bot, chat_id, name, role) VALUES ('test','555','Lâm','owner')").run();

  const first = stubNetwork({});
  await runSchedules(bot, env, new Date('2026-09-19T14:31:00Z')); // 21:31 VN
  first.restore();
  assert.equal(first.sent.length, 1);

  const second = stubNetwork({});
  await runSchedules(bot, env, new Date('2026-09-19T14:33:00Z')); // vẫn trong cửa sổ
  second.restore();
  assert.equal(second.sent.length, 0, 'không được nhắn trùng');
});

test('ảnh: tải về rồi đưa cho LLM đọc', async () => {
  const env = makeEnv(makeD1());
  const update = tgMessage('', { photo: [{ file_id: 'small' }, { file_id: 'big' }], caption: 'bữa tối của mình' });
  const { calls } = await chat(update, { llmReply: 'Nhìn ngon đấy!', env });
  const llmCall = calls.find((c) => c.url.includes('generativelanguage'));
  const parts = llmCall.body.contents.at(-1).parts;
  assert.ok(parts.some((p) => p.inline_data), 'phải gửi kèm ảnh cho LLM');
  assert.ok(calls.some((c) => c.url.includes('getFile') && c.body.file_id === 'big'), 'phải lấy ảnh khổ lớn nhất');
});

test('thiếu khoá API: bot vẫn trả lời /status và chỉ cho chủ bot cách sửa', async () => {
  const env = { DB: makeD1(), TELEGRAM_TOKEN_TEST: '123:fake' }; // cố tình không có GEMINI_API_KEY

  const status = await chat(tgMessage('/status'), { env });
  assert.match(status.sent[0].text, /chưa cấu hình khoá API/);

  const talk = await chat(tgMessage('chào bạn'), { env });
  assert.match(talk.sent[0].text, /wrangler secret put GEMINI_API_KEY/);
});
