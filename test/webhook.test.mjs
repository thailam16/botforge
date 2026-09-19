// Cổng vào Worker: chỉ Telegram (có mật khẩu đúng) mới được nói chuyện với bot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/index.js';
import { makeD1, makeEnv, testBot, stubNetwork } from './helpers.mjs';

const BOTS = { test: testBot() };
// Gom việc chạy nền lại để test chờ xong hẳn rồi mới gỡ stub mạng.
function makeCtx() {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), settle: () => Promise.allSettled(pending) };
}
const ctx = makeCtx();

function post(path, { secret, body = { message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: 'hi' } } } = {}) {
  return new Request(`https://w.dev${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
    body: JSON.stringify(body),
  });
}

test('webhook: thiếu mật khẩu trong môi trường thì từ chối tất cả', async () => {
  const env = makeEnv(makeD1()); // không có WEBHOOK_SECRET_TEST
  const res = await handleRequest(post('/tg/test', { secret: 'bat-ky' }), env, ctx, BOTS);
  assert.equal(res.status, 403);
});

test('webhook: sai mật khẩu -> 403, đúng mật khẩu -> 200', async () => {
  const env = { ...makeEnv(makeD1()), WEBHOOK_SECRET_TEST: 'matkhau-dung' };

  assert.equal((await handleRequest(post('/tg/test', { secret: 'sai' }), env, ctx, BOTS)).status, 403);
  assert.equal((await handleRequest(post('/tg/test'), env, ctx, BOTS)).status, 403, 'không gửi mật khẩu cũng phải bị chặn');

  const net = stubNetwork({ llmReply: 'chào bạn' });
  const live = makeCtx();
  const ok = await handleRequest(post('/tg/test', { secret: 'matkhau-dung' }), env, live, BOTS);
  await live.settle();          // chờ việc nền xong rồi mới trả mạng về như cũ
  net.restore();
  assert.equal(ok.status, 200);
  assert.ok(net.sent.some((m) => m.text === 'chào bạn'), 'tin hợp lệ phải được xử lý thật');
});

test('webhook: bot không tồn tại -> 404, body quá lớn -> 413', async () => {
  const env = { ...makeEnv(makeD1()), WEBHOOK_SECRET_TEST: 'x' };
  assert.equal((await handleRequest(post('/tg/khongco', { secret: 'x' }), env, ctx, BOTS)).status, 404);

  const big = new Request('https://w.dev/tg/test', {
    method: 'POST',
    headers: { 'content-length': '5000000', 'x-telegram-bot-api-secret-token': 'x' },
    body: '{}',
  });
  assert.equal((await handleRequest(big, env, ctx, BOTS)).status, 413);
});

test('health: không tiết lộ tên bot (đường dẫn webhook phải khó đoán)', async () => {
  const res = await handleRequest(new Request('https://w.dev/health'), makeEnv(makeD1()), ctx, BOTS);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.bots, 1, 'chỉ trả về số lượng');
  assert.ok(!JSON.stringify(body).includes('test'), 'không được lộ key của bot');
});
