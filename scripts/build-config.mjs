#!/usr/bin/env node
// Đọc bots/*.yaml -> kiểm tra -> sinh src/generated/bots.js để Worker nạp được.
// (Worker không đọc được file trên đĩa nên cấu hình phải nằm trong mã nguồn đã đóng gói.)
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOTS_DIR = join(ROOT, 'bots');
const OUT = join(ROOT, 'src/generated/bots.js');

const KNOWN_PLUGINS = ['memory', 'reminders', 'nutrition', 'expense'];
const KNOWN_PROVIDERS = ['gemini', 'openai'];

export function validateBot(bot, file) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(`${file}: ${msg}`); };

  need(bot && typeof bot === 'object', 'file rỗng hoặc sai định dạng YAML');
  if (!bot || typeof bot !== 'object') return errs;

  need(/^[a-z0-9_-]+$/.test(bot.key || ''), '"key" phải có và chỉ gồm chữ thường, số, gạch ngang (ví dụ: nger)');
  need(bot.name, '"name" (tên hiển thị của bot) không được trống');
  need(bot.persona && bot.persona.trim().length > 20, '"persona" cần mô tả vai của bot, ít nhất vài câu');
  need(bot.llm?.provider && KNOWN_PROVIDERS.includes(bot.llm.provider), `"llm.provider" phải là một trong: ${KNOWN_PROVIDERS.join(', ')}`);
  need(bot.llm?.model, '"llm.model" không được trống');

  if (bot.llm?.fallback) {
    need(KNOWN_PROVIDERS.includes(bot.llm.fallback.provider), `"llm.fallback.provider" phải là một trong: ${KNOWN_PROVIDERS.join(', ')}`);
    need(bot.llm.fallback.model, '"llm.fallback.model" không được trống');
  }

  for (const name of Object.keys(bot.plugins || {})) {
    need(KNOWN_PLUGINS.includes(name), `plugin "${name}" không tồn tại (có: ${KNOWN_PLUGINS.join(', ')})`);
  }

  const mode = bot.access?.mode || 'claim';
  need(['whitelist', 'open', 'claim'].includes(mode), '"access.mode" phải là whitelist | open | claim');
  if (mode === 'whitelist') {
    need((bot.access?.users || []).length || (bot.access?.groups || []).length,
      'access.mode = whitelist thì phải khai báo ít nhất một user hoặc group');
  }
  if (bot.timezone) {
    try { new Intl.DateTimeFormat('en', { timeZone: bot.timezone }); }
    catch { errs.push(`${file}: "timezone" không hợp lệ (ví dụ đúng: Asia/Ho_Chi_Minh)`); }
  }
  return errs;
}

export function loadBots(dir = BOTS_DIR) {
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f) && !f.startsWith('_'));
  const bots = {};
  const errors = [];
  for (const file of files) {
    let bot;
    try {
      bot = parse(readFileSync(join(dir, file), 'utf8'));
    } catch (err) {
      errors.push(`${file}: YAML sai cú pháp — ${err.message}`);
      continue;
    }
    const errs = validateBot(bot, file);
    if (errs.length) { errors.push(...errs); continue; }
    if (bots[bot.key]) { errors.push(`${file}: trùng key "${bot.key}" với file khác`); continue; }
    bots[bot.key] = bot;
  }
  return { bots, errors, count: files.length };
}

function main() {
  const { bots, errors, count } = loadBots();
  if (errors.length) {
    console.error('❌ Cấu hình bot có lỗi:\n' + errors.map((e) => `   • ${e}`).join('\n'));
    process.exit(1);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    `// TỰ ĐỘNG SINH RA từ thư mục bots/ — đừng sửa tay.\n` +
    `// Chạy "npm run build:config" để tạo lại.\n` +
    `export const BOTS = ${JSON.stringify(bots, null, 2)};\n`,
  );
  const names = Object.values(bots).map((b) => `${b.name} (/tg/${b.key})`);
  console.log(`✅ Đã nạp ${Object.keys(bots).length}/${count} bot: ${names.join(', ') || '(chưa có bot nào)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
