-- BotForge — cấu trúc CSDL D1 (SQLite trên Cloudflare)
-- Chạy: npm run db:init   (hoặc db:init:local để thử ở máy)
-- Mọi bảng đều có cột `bot` để nhiều bot dùng chung 1 CSDL mà không lẫn dữ liệu.

CREATE TABLE IF NOT EXISTS users (
  bot        TEXT NOT NULL,
  chat_id    TEXT NOT NULL,
  user_key   TEXT,
  name       TEXT,
  role       TEXT DEFAULT 'user',      -- owner | user
  profile    TEXT DEFAULT '{}',        -- JSON hồ sơ (tuổi, cân nặng, mục tiêu...)
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (bot, chat_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  bot     TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  role    TEXT NOT NULL,               -- user | assistant
  who     TEXT,                        -- tên người nói (dùng trong group)
  content TEXT NOT NULL,
  ts      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (bot, chat_id, id DESC);

CREATE TABLE IF NOT EXISTS memory (
  bot        TEXT NOT NULL,
  chat_id    TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (bot, chat_id)
);

CREATE TABLE IF NOT EXISTS kv (
  bot   TEXT NOT NULL,
  k     TEXT NOT NULL,
  v     TEXT,
  PRIMARY KEY (bot, k)
);

CREATE TABLE IF NOT EXISTS reminders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bot        TEXT NOT NULL,
  chat_id    TEXT NOT NULL,
  text       TEXT NOT NULL,
  due_at     TEXT NOT NULL,            -- ISO UTC
  repeat     TEXT DEFAULT 'none',      -- none | daily | weekly | monthly
  days       TEXT,                     -- JSON [1,2,3] (thứ 2..6) cho repeat daily
  done       INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (bot, done, due_at);

-- ── Plugin dinh dưỡng (kiểu PT Nger) ───────────────────────────────
CREATE TABLE IF NOT EXISTS meals (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  bot      TEXT NOT NULL,
  chat_id  TEXT NOT NULL,
  date     TEXT NOT NULL,              -- YYYY-MM-DD theo giờ địa phương của bot
  time     TEXT,
  slot     TEXT,                       -- sang | trua | toi | phu
  title    TEXT,
  kcal     REAL DEFAULT 0,
  protein  REAL DEFAULT 0,
  carb     REAL DEFAULT 0,
  fat      REAL DEFAULT 0,
  note     TEXT,
  photo    TEXT,                       -- khoá R2 hoặc file_id Telegram
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meals_day ON meals (bot, chat_id, date);

CREATE TABLE IF NOT EXISTS meal_items (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER NOT NULL,
  name    TEXT,
  qty     TEXT,
  kcal    REAL DEFAULT 0,
  protein REAL DEFAULT 0,
  carb    REAL DEFAULT 0,
  fat     REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_meal_items ON meal_items (meal_id);

CREATE TABLE IF NOT EXISTS workouts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  bot       TEXT NOT NULL,
  chat_id   TEXT NOT NULL,
  date      TEXT NOT NULL,
  kind      TEXT,
  minutes   REAL DEFAULT 0,
  kcal_burn REAL DEFAULT 0,
  note      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_day ON workouts (bot, chat_id, date);

CREATE TABLE IF NOT EXISTS body_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  bot       TEXT NOT NULL,
  chat_id   TEXT NOT NULL,
  date      TEXT NOT NULL,
  weight_kg REAL,
  body_fat  REAL,
  muscle_kg REAL,
  note      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_body_day ON body_log (bot, chat_id, date);

-- ── Plugin sổ chi tiêu + việc cần làm (kiểu Bơ / Lisa) ─────────────
CREATE TABLE IF NOT EXISTS expenses (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  bot      TEXT NOT NULL,
  chat_id  TEXT NOT NULL,
  date     TEXT NOT NULL,
  payer    TEXT,
  title    TEXT NOT NULL,
  amount   REAL NOT NULL,
  category TEXT,
  note     TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_day ON expenses (bot, chat_id, date);

CREATE TABLE IF NOT EXISTS todos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  bot      TEXT NOT NULL,
  chat_id  TEXT NOT NULL,
  text     TEXT NOT NULL,
  done     INTEGER DEFAULT 0,
  due      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_todos ON todos (bot, chat_id, done);

-- ── Gom ảnh gửi theo chùm (album Telegram) ─────────────────────────
CREATE TABLE IF NOT EXISTS pending_media (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  bot      TEXT NOT NULL,
  chat_id  TEXT NOT NULL,
  group_id TEXT NOT NULL,
  file_id  TEXT NOT NULL,
  caption  TEXT,
  ts       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_media ON pending_media (bot, group_id);
