#!/usr/bin/env node
// Nối Telegram với Worker (chạy lại mỗi khi đổi tên Worker hoặc thêm bot).
//   npm run webhook              -> nối tất cả bot
//   npm run webhook -- nger      -> chỉ bot "nger"
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadBots } from './build-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

function workerUrl() {
  if (process.env.WORKER_URL) return process.env.WORKER_URL.replace(/\/$/, '');
  const env = readEnv();
  if (env.WORKER_URL) return env.WORKER_URL.replace(/\/$/, '');
  // Đoán từ kết quả deploy gần nhất
  const r = spawnSync('npx', ['--yes', 'wrangler', 'deployments', 'list'], { cwd: ROOT, encoding: 'utf8' });
  const m = `${r.stdout || ''}`.match(/https:\/\/[^\s]+\.workers\.dev/);
  return m ? m[0] : null;
}

const only = process.argv[2];
const { bots, errors } = loadBots();
if (errors.length) {
  console.error('❌ Cấu hình lỗi:\n' + errors.map((e) => `   • ${e}`).join('\n'));
  process.exit(1);
}

const base = workerUrl();
if (!base) {
  console.error('❌ Không tìm ra địa chỉ Worker. Thêm dòng WORKER_URL=https://... vào .env rồi chạy lại.');
  process.exit(1);
}
console.log(`Worker: ${base}`);

const env = readEnv();
let failed = 0;
for (const bot of Object.values(bots)) {
  if (only && bot.key !== only) continue;
  const token = env[`TELEGRAM_TOKEN_${bot.key.toUpperCase()}`];
  const secret = env[`WEBHOOK_SECRET_${bot.key.toUpperCase()}`];
  if (!token) {
    console.error(`  ✗ ${bot.key}: thiếu TELEGRAM_TOKEN_${bot.key.toUpperCase()} trong .env`);
    failed++;
    continue;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: `${base}/tg/${bot.key}`,
      secret_token: secret || undefined,
      allowed_updates: ['message', 'edited_message', 'my_chat_member'],
      drop_pending_updates: true,
    }),
  }).then((r) => r.json()).catch((e) => ({ description: e.message }));
  console.log(res?.ok ? `  ✓ ${bot.name} -> ${base}/tg/${bot.key}` : `  ✗ ${bot.key}: ${res?.description}`);
  if (!res?.ok) failed++;
}
process.exit(failed ? 1 : 0);
