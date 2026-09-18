#!/usr/bin/env node
// Wizard tiếng Việt: hỏi từng bước rồi tạo ra một con bot hoàn chỉnh.
//   npm run setup
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { createLLM } from '../src/llm/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rl = createInterface({ input: stdin, output: stdout });

const C = {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
};

const TEMPLATES = [
  { file: 'tro-ly.yaml', label: 'Trợ lý / cố vấn riêng — trò chuyện, ghi nhớ, nhắc việc' },
  { file: 'pt-dinh-duong.yaml', label: 'PT dinh dưỡng — gửi ảnh bữa ăn, tính calo, theo dõi cân nặng' },
  { file: 'quan-gia.yaml', label: 'Quản gia gia đình — sổ chi tiêu, việc cần làm, nhắc lịch' },
  { file: null, label: 'Tự mô tả — bạn kể bot làm gì, AI viết persona giúp bạn' },
];

const PLUGIN_LABELS = {
  memory: 'Trí nhớ dài hạn (mỗi đêm tự chắt lọc)',
  reminders: 'Nhắc việc & lịch chủ động',
  nutrition: 'Theo dõi dinh dưỡng (ảnh bữa ăn, calo, cân nặng)',
  expense: 'Sổ chi tiêu & việc cần làm',
};

async function ask(q, def = '') {
  const a = (await rl.question(`${q}${def ? C.dim(` [${def}]`) : ''} `)).trim();
  return a || def;
}

async function askYesNo(q, def = true) {
  const a = (await rl.question(`${q} ${C.dim(def ? '(C/k)' : '(c/K)')} `)).trim().toLowerCase();
  if (!a) return def;
  return ['c', 'co', 'có', 'y', 'yes', 'ừ', 'u'].includes(a);
}

async function askChoice(q, options) {
  console.log(`\n${C.b(q)}`);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o.label ?? o}`));
  while (true) {
    const a = Number(await rl.question('Chọn số: '));
    if (a >= 1 && a <= options.length) return a - 1;
    console.log(C.err('Số không hợp lệ, chọn lại nhé.'));
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function wrangler(args, opts) {
  return run('npx', ['--yes', 'wrangler', ...args], opts);
}

function saveEnv(key, value) {
  const path = join(ROOT, '.env');
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, line);
  else text += `${text.endsWith('\n') || !text ? '' : '\n'}${line}\n`;
  writeFileSync(path, text);
}

function readEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

async function main() {
  console.log(`
${C.b('🤖 BotForge — tạo bot Telegram của riêng bạn')}
${C.dim('Mình sẽ hỏi vài câu rồi lo phần còn lại. Bấm Enter để lấy giá trị gợi ý trong ngoặc.')}
`);

  const env = readEnv();

  // ── 1. Bộ não (LLM) ────────────────────────────────────────────
  console.log(C.b('\n── Bước 1/6: Bộ não của bot ──'));
  const provIdx = await askChoice('Bạn dùng dịch vụ AI nào?', [
    { label: 'Google Gemini — có gói miễn phí, đọc được ảnh (khuyến nghị)' },
    { label: 'Tương thích OpenAI — OpenAI, OpenRouter, DeepSeek, Ollama, proxy riêng…' },
  ]);
  const provider = provIdx === 0 ? 'gemini' : 'openai';

  let baseUrl = '';
  if (provider === 'openai') {
    baseUrl = await ask('Địa chỉ API (base URL):', env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
    saveEnv('OPENAI_BASE_URL', baseUrl);
  }

  const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
  const keyHint = provider === 'gemini'
    ? 'Lấy miễn phí ở https://aistudio.google.com/apikey'
    : 'Khoá của dịch vụ bạn chọn (để trống nếu chạy Ollama ở máy)';
  console.log(C.dim(`  ${keyHint}`));
  const apiKey = await ask(`Dán ${keyName}:`, env[keyName] || '');
  if (apiKey) saveEnv(keyName, apiKey);

  const model = await ask(
    'Tên model:',
    provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini',
  );

  const llm = createLLM(
    { key: 'setup', llm: { provider, model, base_url: baseUrl || undefined } },
    { [keyName]: apiKey, OPENAI_BASE_URL: baseUrl, GEMINI_BASE_URL: '' },
  );

  process.stdout.write('Đang thử gọi AI... ');
  try {
    await llm.chat({ messages: [{ role: 'user', text: 'Trả lời đúng một từ: OK' }], maxTokens: 20 });
    console.log(C.ok('chạy tốt ✓'));
  } catch (err) {
    console.log(C.err(`lỗi: ${err.message}`));
    if (!(await askYesNo('Vẫn tiếp tục?', false))) process.exit(1);
  }

  // ── 2. Bot Telegram ────────────────────────────────────────────
  console.log(C.b('\n── Bước 2/6: Bot Telegram ──'));
  console.log(C.dim('  Mở Telegram, chat với @BotFather, gõ /newbot rồi dán token vào đây.'));
  let token = '';
  let me = null;
  while (!me) {
    token = await ask('Token bot:');
    if (!token) { console.log(C.err('Cần token mới đi tiếp được.')); continue; }
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()).catch(() => null);
    if (res?.ok) {
      me = res.result;
      console.log(C.ok(`  ✓ Nhận ra bot: ${me.first_name} (@${me.username})`));
    } else {
      console.log(C.err(`  ✗ Token không dùng được: ${res?.description || 'không gọi được Telegram'}`));
    }
  }

  // ── 3. Danh tính bot ───────────────────────────────────────────
  console.log(C.b('\n── Bước 3/6: Bot của bạn tên gì, làm gì ──'));
  const name = await ask('Tên hiển thị (ví dụ Bơ, Lisa, PT Nger):', me.first_name);
  const key = (await ask('Mã ngắn không dấu (dùng cho đường dẫn webhook):', slug(name)))
    .toLowerCase().replace(/[^a-z0-9_-]/g, '') || slug(name);
  const emoji = await ask('Emoji đại diện:', '🤖');

  const tIdx = await askChoice('Bắt đầu từ mẫu nào?', TEMPLATES);
  let bot;
  if (TEMPLATES[tIdx].file) {
    bot = parse(readFileSync(join(ROOT, 'templates', TEMPLATES[tIdx].file), 'utf8'));
  } else {
    bot = parse(readFileSync(join(ROOT, 'templates', 'tro-ly.yaml'), 'utf8'));
  }

  const wantWrite = TEMPLATES[tIdx].file
    ? await askYesNo('Bạn muốn mô tả thêm để AI viết lại persona cho hợp ý mình không?', false)
    : true;

  if (wantWrite) {
    console.log(C.dim('\n  Cứ kể tự nhiên: bot đóng vai gì, nói chuyện kiểu gì, phục vụ ai, kiêng gì.'));
    const brief = await ask('Mô tả bot của bạn:');
    if (brief) {
      process.stdout.write('AI đang viết persona... ');
      try {
        const generated = await generatePersona(llm, { name, brief });
        bot.persona = generated.persona;
        bot.style = generated.style;
        console.log(C.ok('xong ✓'));
        console.log(`\n${C.dim('─'.repeat(60))}\n${generated.persona}\n\nPHONG CÁCH:\n${generated.style.map((s) => `- ${s}`).join('\n')}\n${C.dim('─'.repeat(60))}`);
        if (generated.plugins?.length) {
          console.log(C.dim(`AI gợi ý bật: ${generated.plugins.map((p) => PLUGIN_LABELS[p] || p).join(', ')}`));
          bot.plugins = Object.fromEntries(generated.plugins.map((p) => [p, { ...(bot.plugins?.[p] || {}), enabled: true }]));
        }
        if (!(await askYesNo('Dùng persona này?', true))) {
          bot.persona = await ask('Vậy bạn tự viết persona (một đoạn):', bot.persona);
        }
      } catch (err) {
        console.log(C.err(`lỗi (${err.message}) — dùng persona mẫu.`));
      }
    }
  }

  // ── 4. Tính năng ───────────────────────────────────────────────
  console.log(C.b('\n── Bước 4/6: Tính năng ──'));
  const plugins = {};
  for (const [p, label] of Object.entries(PLUGIN_LABELS)) {
    const on = bot.plugins?.[p]?.enabled !== undefined ? bot.plugins[p].enabled !== false : !!bot.plugins?.[p];
    if (await askYesNo(`Bật "${label}"?`, on)) {
      plugins[p] = { ...(bot.plugins?.[p] || {}), enabled: true };
    }
  }

  // ── 5. Ai được dùng bot ────────────────────────────────────────
  console.log(C.b('\n── Bước 5/6: Ai được dùng bot ──'));
  const mIdx = await askChoice('Chế độ truy cập:', [
    { label: 'Riêng tư — người nhắn đầu tiên trở thành chủ, người lạ bị lờ đi (khuyến nghị)' },
    { label: 'Danh sách trắng — chỉ những chat id bạn khai báo' },
    { label: 'Mở — ai cũng chat được (tốn tiền AI, cân nhắc)' },
  ]);
  const mode = ['claim', 'whitelist', 'open'][mIdx];
  const users = [];
  if (mode === 'whitelist') {
    console.log(C.dim('  Không biết chat id? Nhắn cho @userinfobot trên Telegram là nó trả lời ngay.'));
    while (true) {
      const id = await ask('Chat id (Enter để dừng):');
      if (!id) break;
      const uname = await ask('  Tên người này:', 'Chủ bot');
      users.push({ key: slug(uname), chat_id: String(id), name: uname, role: users.length ? 'user' : 'owner' });
    }
  }

  const tz = await ask('Múi giờ:', bot.timezone || 'Asia/Ho_Chi_Minh');

  // ── Ghi file cấu hình ──────────────────────────────────────────
  Object.assign(bot, {
    key, name, emoji, timezone: tz,
    username: me.username,
    llm: { provider, model, ...(baseUrl ? { base_url: baseUrl } : {}) },
    access: { mode, users, groups: bot.access?.groups || [], group_trigger: [name, `@${me.username}`] },
    plugins,
  });

  const yamlPath = join(ROOT, 'bots', `${key}.yaml`);
  writeFileSync(yamlPath, `# Bot "${name}" — tạo bằng npm run setup ngày ${new Date().toISOString().slice(0, 10)}\n${stringify(bot)}`);
  console.log(C.ok(`\n✓ Đã ghi cấu hình: bots/${key}.yaml`));

  const secret = randomSecret();
  saveEnv(`TELEGRAM_TOKEN_${key.toUpperCase()}`, token);
  saveEnv(`WEBHOOK_SECRET_${key.toUpperCase()}`, secret);
  console.log(C.ok('✓ Đã lưu token vào .env (file này KHÔNG được commit lên GitHub)'));

  const build = run('node', ['scripts/build-config.mjs']);
  console.log(build.out.trim());
  if (build.code !== 0) process.exit(1);

  // ── 6. Đưa lên Cloudflare ──────────────────────────────────────
  console.log(C.b('\n── Bước 6/6: Đưa bot lên mây để chạy 24/7 ──'));
  if (!(await askYesNo('Triển khai lên Cloudflare luôn bây giờ?', true))) {
    printManual(key, secret);
    return rl.close();
  }

  const who = wrangler(['whoami']);
  if (who.code !== 0 || /not authenticated|log in/i.test(who.out)) {
    console.log(C.warn('Bạn chưa đăng nhập Cloudflare. Mình mở trình duyệt để bạn đăng nhập nhé.'));
    const login = wrangler(['login'], { stdio: 'inherit' });
    if (login.code !== 0) {
      console.log(C.err('Đăng nhập chưa xong. Bạn chạy lại `npx wrangler login` rồi `npm run deploy`.'));
      printManual(key, secret);
      return rl.close();
    }
  }

  ensureWranglerToml();
  if (!/database_id\s*=\s*"[0-9a-f-]{8,}"/.test(readFileSync(join(ROOT, 'wrangler.toml'), 'utf8'))) {
    process.stdout.write('Đang tạo cơ sở dữ liệu D1... ');
    const created = wrangler(['d1', 'create', 'botforge']);
    const id = (created.out.match(/database_id\s*=\s*"([0-9a-f-]+)"/) || created.out.match(/"uuid":\s*"([0-9a-f-]+)"/) || [])[1];
    if (id) {
      const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8').replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${id}"`);
      writeFileSync(join(ROOT, 'wrangler.toml'), toml);
      console.log(C.ok('xong ✓'));
    } else if (/already exists/i.test(created.out)) {
      console.log(C.warn('CSDL "botforge" đã có sẵn.'));
      console.log(C.dim('  Chạy `npx wrangler d1 list` rồi dán database_id vào wrangler.toml.'));
    } else {
      console.log(C.err('không tạo được.'));
      console.log(C.dim(created.out.slice(-600)));
    }
  }

  process.stdout.write('Đang tạo bảng trong CSDL... ');
  const schema = wrangler(['d1', 'execute', 'botforge', '--remote', '--file=schema.sql', '-y']);
  console.log(schema.code === 0 ? C.ok('xong ✓') : C.warn('bỏ qua (chạy lại bằng `npm run db:init`)'));

  for (const [k, v] of [
    [keyName, apiKey],
    ...(baseUrl ? [['OPENAI_BASE_URL', baseUrl]] : []),
    [`TELEGRAM_TOKEN_${key.toUpperCase()}`, token],
    [`WEBHOOK_SECRET_${key.toUpperCase()}`, secret],
  ]) {
    if (!v) continue;
    process.stdout.write(`Đang cất khoá ${k} lên Cloudflare... `);
    const r = wrangler(['secret', 'put', k], { input: v });
    console.log(r.code === 0 ? C.ok('✓') : C.err(`lỗi\n${r.out.slice(-300)}`));
  }

  process.stdout.write('Đang triển khai Worker... ');
  const dep = wrangler(['deploy']);
  const url = (dep.out.match(/https:\/\/[^\s]+\.workers\.dev/) || [])[0];
  if (dep.code !== 0) {
    console.log(C.err('lỗi'));
    console.log(dep.out.slice(-1500));
    printManual(key, secret);
    return rl.close();
  }
  console.log(C.ok(`xong ✓  ${url || ''}`));

  if (url) {
    process.stdout.write('Đang nối Telegram với Worker... ');
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${url}/tg/${key}`,
        secret_token: secret,
        allowed_updates: ['message', 'edited_message', 'my_chat_member'],
        drop_pending_updates: true,
      }),
    }).then((r) => r.json()).catch((e) => ({ description: e.message }));
    console.log(res?.ok ? C.ok('xong ✓') : C.err(`lỗi: ${res?.description}`));
  }

  console.log(`
${C.ok(C.b('🎉 Xong rồi!'))}

Mở Telegram, tìm ${C.b(`@${me.username}`)} và bấm ${C.b('Start')}.
${mode === 'claim' ? C.dim('Người nhắn đầu tiên sẽ trở thành chủ bot — nhớ nhắn trước người khác nhé.') : ''}

Sau này muốn sửa tính cách hay tính năng: sửa ${C.b(`bots/${key}.yaml`)} rồi chạy ${C.b('npm run deploy')}.
Muốn thêm bot thứ hai: chạy lại ${C.b('npm run setup')}.
`);
  rl.close();
}

function printManual(key, secret) {
  console.log(`
${C.b('Các bước còn lại bạn tự chạy khi sẵn sàng:')}
  npx wrangler login
  npx wrangler d1 create botforge     ${C.dim('# rồi dán database_id vào wrangler.toml')}
  npm run db:init
  npx wrangler secret put TELEGRAM_TOKEN_${key.toUpperCase()}
  npx wrangler secret put WEBHOOK_SECRET_${key.toUpperCase()}   ${C.dim(`# giá trị: ${secret}`)}
  npm run deploy
  npm run webhook                     ${C.dim('# nối Telegram với Worker')}
`);
}

function ensureWranglerToml() {
  const path = join(ROOT, 'wrangler.toml');
  if (existsSync(path)) return;
  writeFileSync(path, readFileSync(join(ROOT, 'wrangler.example.toml'), 'utf8'));
  console.log(C.dim('  (đã tạo wrangler.toml từ bản mẫu)'));
}

async function generatePersona(llm, { name, brief }) {
  const { text } = await llm.chat({
    system:
      'Bạn giúp người dùng viết cấu hình cho một chatbot Telegram tiếng Việt. ' +
      'Trả về DUY NHẤT một khối JSON hợp lệ, không giải thích, không bọc trong dấu ```. Cấu trúc: ' +
      '{"persona": "đoạn văn 4-8 câu mô tả vai, tính cách, cách xưng hô, nguyên tắc ứng xử — viết ở ngôi \\"Bạn là...\\"", ' +
      '"style": ["3-5 câu quy tắc ngắn về cách nhắn tin"], ' +
      '"plugins": ["chọn trong: memory, reminders, nutrition, expense"]}. ' +
      'memory = nhớ lâu dài; reminders = nhắc việc; nutrition = theo dõi ăn uống/calo; expense = sổ chi tiêu và việc cần làm.',
    messages: [{ role: 'user', text: `Tên bot: ${name}\nNgười dùng mô tả: ${brief}` }],
    maxTokens: 1200,
    temperature: 0.7,
  });
  const json = text.replace(/^```(json)?/gm, '').replace(/```$/gm, '').trim();
  const obj = JSON.parse(json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1));
  if (!obj.persona) throw new Error('AI trả về thiếu persona');
  return {
    persona: String(obj.persona).trim(),
    style: Array.isArray(obj.style) ? obj.style.slice(0, 6).map(String) : [],
    plugins: Array.isArray(obj.plugins) ? obj.plugins.filter((p) => PLUGIN_LABELS[p]) : [],
  };
}

function slug(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bot';
}

function randomSecret() {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

main().catch((err) => {
  console.error(C.err(`\nLỗi: ${err.stack || err.message}`));
  rl.close();
  process.exit(1);
});
