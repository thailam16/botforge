#!/usr/bin/env node
// Kiểm tra nhanh trước khi deploy: cú pháp mọi file + cấu hình bot hợp lệ.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadBots } from './build-config.mjs';

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

const { bots, errors } = loadBots();
if (errors.length) {
  console.error('❌ Cấu hình bot:\n' + errors.map((e) => `   • ${e}`).join('\n'));
  bad++;
} else {
  console.log(`✅ Cấu hình: ${Object.keys(bots).length} bot hợp lệ`);
}
process.exit(bad ? 1 : 0);
