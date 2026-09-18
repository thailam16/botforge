// Cron của Cloudflare gọi hàm này (mặc định 5 phút/lần).
// Mỗi plugin khai báo `jobs`; scheduler lo đúng giờ, đúng ngày, không chạy trùng.
import { makeContext, say } from './runtime.js';
import { isQuietHours, isTimeSlot, localParts, today } from './time.js';

const TICK_WINDOW_MIN = 6; // hơn nhịp cron một chút để không lọt mốc

export async function runSchedules(bot, env, now = new Date()) {
  const base = makeContext(bot, env, { now });
  const { store, tz } = base;
  const quiet = isQuietHours(tz, bot.quiet_hours, now);
  const ran = [];

  for (const { plugin, config } of base.plugins) {
    for (const job of plugin.jobs || []) {
      const times = jobTimes(job, config);
      const due = job.everyTick || times.some((t) => isTimeSlot(tz, t, TICK_WINDOW_MIN, now));
      if (!due) continue;
      if (!matchesDay(job, tz, now)) continue;
      if (quiet && !job.ignoreQuietHours) continue;

      const slot = job.everyTick ? 'tick' : times.find((t) => isTimeSlot(tz, t, TICK_WINDOW_MIN, now));
      const mark = `job:${plugin.name}:${job.id}:${slot}`;
      if (!job.everyTick) {
        const last = await store.kvGet(mark);
        if (last === today(tz, now)) continue; // hôm nay chạy rồi
        await store.kvSet(mark, today(tz, now));
      }

      try {
        const sent = await runJob(base, plugin, job, config, quiet);
        ran.push(`${plugin.name}/${job.id}${sent ? ` (${sent} tin)` : ''}`);
      } catch (err) {
        console.error(`job ${plugin.name}/${job.id} lỗi:`, err.message);
      }
    }
  }

  await maintenance(base, now);
  return ran;
}

async function runJob(base, plugin, job, config, quiet) {
  let sent = 0;
  const targets = job.perUser ? await base.store.listUsers() : [null];

  for (const user of targets) {
    const ctx = { ...base, config, user, chatId: user ? user.chat_id : null };
    const out = await job.run(ctx);
    if (!out || job.silent) continue;

    const messages = Array.isArray(out)
      ? out
      : [{ chatId: ctx.chatId, text: out }];
    for (const m of messages) {
      if (!m.chatId || !m.text) continue;
      if (quiet && !job.ignoreQuietHours) continue;
      await say(base, m.chatId, m.text);
      await base.store.addMessage(m.chatId, 'assistant', m.text);
      sent++;
    }
  }
  return sent;
}

/** Danh sách mốc giờ của một job, có thể bị cấu hình YAML ghi đè. */
export function jobTimes(job, config = {}) {
  if (job.atListFromConfig && Array.isArray(config[job.atListFromConfig])) return config[job.atListFromConfig];
  if (job.atFromConfig && config[job.atFromConfig]) return [config[job.atFromConfig]];
  return job.at ? [job.at] : [];
}

function matchesDay(job, tz, now) {
  if (job.weekday === undefined && !job.days) return true;
  const wd = localParts(tz, now).weekday;
  if (job.days) return job.days.includes(wd);
  return wd === job.weekday;
}

/** Dọn dẹp để CSDL miễn phí không phình theo thời gian. */
async function maintenance(ctx, now) {
  const stamp = today(ctx.tz, now);
  if ((await ctx.store.kvGet('maintenance')) === stamp) return;
  await ctx.store.kvSet('maintenance', stamp);
  await ctx.store.pruneMessages(ctx.bot.keep_history_days || 30);
  await ctx.store.run("DELETE FROM pending_media WHERE bot=? AND ts < ?", ctx.store.bot, Date.now() - 86400000);
}
