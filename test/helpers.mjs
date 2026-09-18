// Giả lập môi trường Cloudflare (D1 + fetch) để chạy thử ngay trên máy.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

class Stmt {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }
  bind(...args) {
    this.args = args.map((a) => (a === undefined ? null : a));
    return this;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args) };
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null;
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
  }
}

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf8'));
  return { prepare: (sql) => new Stmt(db, sql), _raw: db };
}

/** Bot mẫu dùng trong test. */
export function testBot(overrides = {}) {
  return {
    key: 'test',
    name: 'Tester',
    emoji: '🧪',
    timezone: 'Asia/Ho_Chi_Minh',
    persona: 'Bạn là bot thử nghiệm.',
    llm: { provider: 'gemini', model: 'fake' },
    access: { mode: 'claim', users: [], groups: [] },
    quiet_hours: { from: 23, to: 6 },
    plugins: { memory: { enabled: true }, reminders: { enabled: true }, nutrition: { enabled: true }, expense: { enabled: true } },
    ...overrides,
  };
}

/**
 * Thay `fetch` toàn cục: Telegram thì ghi lại, LLM thì trả về kịch bản cho sẵn.
 * Trả về { sent, calls, restore }.
 */
export function stubNetwork({ llmReply = 'ok', llmError = null } = {}) {
  const sent = [];
  const calls = [];
  const original = globalThis.fetch;
  let replies = Array.isArray(llmReply) ? [...llmReply] : [llmReply];

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ url: u, body });

    if (u.includes('api.telegram.org')) {
      if (u.endsWith('/sendMessage')) sent.push({ chatId: String(body.chat_id), text: body.text });
      if (u.includes('/getFile')) return jsonRes({ ok: true, result: { file_path: 'photos/a.jpg' } });
      if (u.includes('/file/bot')) return new Response(new Uint8Array([1, 2, 3]));
      return jsonRes({ ok: true, result: {} });
    }

    if (llmError) throw Object.assign(new Error(llmError.message || 'lỗi LLM'), { status: llmError.status });
    const text = replies.length > 1 ? replies.shift() : replies[0];
    return jsonRes({ candidates: [{ content: { parts: [{ text }] } }] });
  };

  return { sent, calls, restore: () => { globalThis.fetch = original; } };
}

function jsonRes(obj) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
}

export function makeEnv(d1 = makeD1()) {
  return { DB: d1, GEMINI_API_KEY: 'fake-key', TELEGRAM_TOKEN_TEST: '123:fake' };
}

export function tgMessage(text, extra = {}) {
  return {
    message: {
      message_id: 1,
      chat: { id: 555, type: 'private' },
      from: { id: 555, first_name: 'Lâm' },
      text,
      ...extra,
    },
  };
}
