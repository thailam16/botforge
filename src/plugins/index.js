import memory from './memory.js';
import reminders from './reminders.js';
import nutrition from './nutrition.js';
import expense from './expense.js';

export const ALL_PLUGINS = { memory, reminders, nutrition, expense };

/** Lấy danh sách plugin đang bật của một bot, kèm cấu hình riêng của từng cái. */
export function pluginsFor(bot) {
  const out = [];
  for (const [name, cfg] of Object.entries(bot.plugins || {})) {
    const plugin = ALL_PLUGINS[name];
    if (!plugin) continue;
    if (cfg === false || cfg?.enabled === false) continue;
    out.push({ plugin, config: cfg === true ? {} : cfg || {} });
  }
  return out;
}
