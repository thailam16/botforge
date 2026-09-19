// Trình hướng dẫn phải tự dò được máy chủ AI: có model nào, có đọc được ảnh không.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listModels, probeVision } from '../scripts/setup.mjs';

function stub(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status });

test('dò model: đọc được danh sách của máy chủ chuẩn OpenAI', async () => {
  const restore = stub(async (url) => {
    assert.match(String(url), /\/models$/);
    return json({ data: [{ id: 'model-a' }, { id: 'model-b' }] });
  });
  assert.deepEqual(await listModels('https://may-chu.test/v1/', 'k'), ['model-a', 'model-b']);
  restore();
});

test('dò model: máy chủ không hỗ trợ thì trả danh sách rỗng, không làm hỏng wizard', async () => {
  const restore = stub(async () => json({ error: 'nope' }, 404));
  assert.deepEqual(await listModels('https://may-chu.test/v1', ''), []);
  restore();
});

test('dò ảnh: nhận ra máy chủ đọc được ảnh và máy chủ không', async () => {
  let seen;
  let restore = stub(async (url, init) => {
    seen = JSON.parse(init.body);
    return json({ choices: [{ message: { content: 'đỏ' } }] });
  });
  assert.equal(await probeVision('https://may-chu.test/v1', 'k', 'm'), true);
  assert.ok(seen.messages[0].content.some((c) => c.type === 'image_url'), 'phải gửi kèm ảnh thật');
  restore();

  restore = stub(async () => json({ error: { message: 'không đọc được ảnh' } }, 500));
  assert.equal(await probeVision('https://may-chu.test/v1', 'k', 'm'), false);
  restore();
});
