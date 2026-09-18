// Điểm vào của Cloudflare Worker.
//   POST /tg/<key>  — Telegram gọi vào mỗi khi có tin nhắn mới (webhook)
//   GET  /health    — kiểm tra bot còn sống
//   cron            — Cloudflare gọi scheduled() theo lịch trong wrangler.toml
import { BOTS } from './generated/bots.js';
import { handleUpdate } from './core/runtime.js';
import { runSchedules } from './core/scheduler.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        bots: Object.keys(BOTS),
        time: new Date().toISOString(),
      });
    }

    const m = url.pathname.match(/^\/tg\/([a-z0-9_-]+)$/i);
    if (m && request.method === 'POST') {
      const bot = BOTS[m[1]];
      if (!bot) return new Response('not found', { status: 404 });

      const secret = env[`WEBHOOK_SECRET_${bot.key.toUpperCase()}`];
      if (secret && request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
        return new Response('forbidden', { status: 403 });
      }

      let update;
      try {
        update = await request.json();
      } catch {
        return new Response('bad json', { status: 400 });
      }

      // Telegram cần phản hồi ngay, việc nặng để chạy nền.
      ctx.waitUntil(
        handleUpdate(update, bot, env).catch((err) => console.error(`[${bot.key}] lỗi:`, err.stack || err.message)),
      );
      return new Response('ok');
    }

    if (url.pathname === '/') {
      return new Response(
        `BotForge đang chạy. Bot: ${Object.keys(BOTS).join(', ') || '(chưa có bot nào)'}`,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        for (const bot of Object.values(BOTS)) {
          try {
            const ran = await runSchedules(bot, env, new Date(event.scheduledTime));
            if (ran.length) console.log(`[${bot.key}] đã chạy:`, ran.join(', '));
          } catch (err) {
            console.error(`[${bot.key}] lịch lỗi:`, err.stack || err.message);
          }
        }
      })(),
    );
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
