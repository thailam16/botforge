#!/usr/bin/env node
// Kiểm tra nhanh trước khi deploy: cú pháp mọi file + cấu hình bot hợp lệ.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadBots } from './build-config.mjs';
import { SECRET_PATTERNS } from '../src/core/guardrails.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(m?js)$/.test(f) ? [p] : [];
  });
}

let bad = 0;
for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'scripts'))]) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`❌ Lỗi cú pháp: ${file.replace(ROOT + '/', '')}\n${r.stderr}`);
    bad++;
  }
}
console.log(bad ? `❌ ${bad} file lỗi cú pháp` : '✅ Cú pháp: tất cả file đều ổn');

// Quét khoá bí mật lỡ dán nhầm vào file sẽ bị commit lên GitHub.
const tracked = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
let leaks = 0;
for (const rel of tracked) {
  if (/^(package-lock\.json|.*\.(png|jpg|ico))$/.test(rel)) continue;
  let text;
  try { text = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
  text.split('\n').forEach((line, i) => {
    if (line.includes('khoa-gia')) return; // dòng tự đánh dấu là khoá giả (dùng trong test)
    for (const re of SECRET_PATTERNS) {
      const hit = line.match(new RegExp(re.source));
      if (hit) {
        console.error(`❌ ${rel}:${i + 1} có chuỗi trông như khoá bí mật (${hit[0].slice(0, 6)}…). Chuyển sang .env rồi xoá khỏi file.`);
        leaks++;
      }
    }
  });
}
if (leaks) bad++;
else console.log('✅ Bí mật: không có khoá nào lọt vào file được commit');

const { bots, errors } = loadBots();
if (errors.length) {
  console.error('❌ Cấu hình bot:\n' + errors.map((e) => `   • ${e}`).join('\n'));
  bad++;
} else {
  console.log(`✅ Cấu hình: ${Object.keys(bots).length} bot hợp lệ`);
}
process.exit(bad ? 1 : 0);
