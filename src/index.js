// Điểm vào của Cloudflare Worker.
//   POST /tg/<key>  — Telegram gọi vào mỗi khi có tin nhắn mới (webhook)
//   GET  /health    — kiểm tra bot còn sống
//   cron            — Cloudflare gọi scheduled() theo lịch trong wrangler.toml
import { BOTS } from './generated/bots.js';
import { handleUpdate } from './core/runtime.js';
import { runSchedules } from './core/scheduler.js';
import { redact } from './core/guardrails.js';

export default {
  fetch: (request, env, ctx) => handleRequest(request, env, ctx, BOTS),
  scheduled: (event, env, ctx) => handleScheduled(event, env, ctx, BOTS),
};

/** Tách riêng khỏi `export default` để test gọi được với danh sách bot giả. */
export async function handleRequest(request, env, ctx, BOTS) {
  {
    const url = new URL(request.url);

    // Cố tình KHÔNG liệt kê tên bot: đường dẫn webhook không nên đoán được từ bên ngoài.
    if (url.pathname === '/health') {
      return json({ ok: true, bots: Object.keys(BOTS).length, time: new Date().toISOString() });
    }

    const m = url.pathname.match(/^\/tg\/([a-z0-9_-]+)$/i);
    if (m && request.method === 'POST') {
      const bot = BOTS[m[1]];
      if (!bot) return new Response('not found', { status: 404 });

      // Bắt buộc có mật khẩu webhook. Thiếu là từ chối — thà bot câm còn hơn
      // để bất kỳ ai trên Internet bơm tin giả vào bot và đốt tiền AI của bạn.
      const secret = env[`WEBHOOK_SECRET_${bot.key.toUpperCase()}`];
      if (!secret) {
        console.error(`[${bot.key}] thiếu WEBHOOK_SECRET_${bot.key.toUpperCase()} — từ chối mọi tin nhắn.`);
        return new Response('forbidden', { status: 403 });
      }
      if (!safeEqual(request.headers.get('x-telegram-bot-api-secret-token') || '', secret)) {
        return new Response('forbidden', { status: 403 });
      }

      // Telegram không gửi tin lớn, chặn sớm body phình to.
      const size = Number(request.headers.get('content-length') || 0);
      if (size > 1_000_000) return new Response('too large', { status: 413 });

      let update;
      try {
        update = await request.json();
      } catch {
        return new Response('bad json', { status: 400 });
      }

      // Telegram cần phản hồi ngay, việc nặng để chạy nền.
      ctx.waitUntil(
        handleUpdate(update, bot, env).catch((err) => console.error(`[${bot.key}] lỗi:`, redact(err.stack || err.message))),
      );
      return new Response('ok');
    }

    if (url.pathname === '/') {
      return new Response('BotForge đang chạy.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    return new Response('not found', { status: 404 });
  }
}

export async function handleScheduled(event, env, ctx, BOTS) {
  {
    ctx.waitUntil(
      (async () => {
        for (const bot of Object.values(BOTS)) {
          try {
            const ran = await runSchedules(bot, env, new Date(event.scheduledTime));
            if (ran.length) console.log(`[${bot.key}] đã chạy:`, ran.join(', '));
          } catch (err) {
            console.error(`[${bot.key}] lịch lỗi:`, redact(err.stack || err.message));
          }
        }
      })(),
    );
  }
}

/** So sánh chuỗi theo kiểu hằng thời gian, không để lộ thông tin qua thời gian phản hồi. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
