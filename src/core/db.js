// Bọc D1 cho gọn: mọi truy vấn đều gắn sẵn khoá `bot` để các bot không lẫn dữ liệu.

export class Store {
  constructor(d1, botKey) {
    this.d1 = d1;
    this.bot = botKey;
  }

  all(sql, ...args) {
    return this.d1.prepare(sql).bind(...args).all().then((r) => r.results || []);
  }
  first(sql, ...args) {
    return this.d1.prepare(sql).bind(...args).first();
  }
  run(sql, ...args) {
    return this.d1.prepare(sql).bind(...args).run();
  }

  // ── Người dùng ───────────────────────────────────────────────
  getUser(chatId) {
    return this.first('SELECT * FROM users WHERE bot=? AND chat_id=?', this.bot, String(chatId));
  }
  async upsertUser({ chatId, userKey, name, role = 'user', profile }) {
    await this.run(
      `INSERT INTO users (bot, chat_id, user_key, name, role, profile) VALUES (?,?,?,?,?,?)
       ON CONFLICT(bot, chat_id) DO UPDATE SET
         user_key = COALESCE(excluded.user_key, users.user_key),
         name     = COALESCE(excluded.name,     users.name),
         role     = COALESCE(excluded.role,     users.role),
         profile  = COALESCE(excluded.profile,  users.profile)`,
      this.bot, String(chatId), userKey || null, name || null, role,
      profile ? JSON.stringify(profile) : null,
    );
    return this.getUser(chatId);
  }
  async setProfile(chatId, patch) {
    const user = await this.getUser(chatId);
    const cur = safeJson(user?.profile) || {};
    const next = { ...cur, ...patch };
    await this.run('UPDATE users SET profile=? WHERE bot=? AND chat_id=?', JSON.stringify(next), this.bot, String(chatId));
    return next;
  }
  listUsers() {
    return this.all('SELECT * FROM users WHERE bot=?', this.bot);
  }

  // ── Lịch sử hội thoại ────────────────────────────────────────
  addMessage(chatId, role, content, who = null) {
    return this.run(
      'INSERT INTO messages (bot, chat_id, role, who, content) VALUES (?,?,?,?,?)',
      this.bot, String(chatId), role, who, String(content).slice(0, 8000),
    );
  }
  async history(chatId, limit = 20) {
    const rows = await this.all(
      'SELECT role, who, content FROM messages WHERE bot=? AND chat_id=? ORDER BY id DESC LIMIT ?',
      this.bot, String(chatId), limit,
    );
    return rows.reverse();
  }
  /** Dọn hội thoại cũ để CSDL miễn phí không phình. */
  pruneMessages(days = 30) {
    return this.run(
      "DELETE FROM messages WHERE bot=? AND ts < datetime('now', ?)",
      this.bot, `-${days} days`,
    );
  }

  // ── Trí nhớ dài hạn ──────────────────────────────────────────
  async getMemory(chatId) {
    const row = await this.first('SELECT content FROM memory WHERE bot=? AND chat_id=?', this.bot, String(chatId));
    return row?.content || '';
  }
  setMemory(chatId, content) {
    return this.run(
      `INSERT INTO memory (bot, chat_id, content, updated_at) VALUES (?,?,?,datetime('now'))
       ON CONFLICT(bot, chat_id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`,
      this.bot, String(chatId), String(content).slice(0, 20000),
    );
  }

  // ── Bộ nhớ khoá/giá trị (trạng thái lịch chạy…) ──────────────
  async kvGet(key, fallback = null) {
    const row = await this.first('SELECT v FROM kv WHERE bot=? AND k=?', this.bot, key);
    return row ? safeJson(row.v) ?? row.v : fallback;
  }
  kvSet(key, value) {
    return this.run(
      `INSERT INTO kv (bot, k, v) VALUES (?,?,?)
       ON CONFLICT(bot, k) DO UPDATE SET v=excluded.v`,
      this.bot, key, JSON.stringify(value),
    );
  }
}

export function safeJson(text) {
  if (typeof text !== 'string') return text ?? null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
