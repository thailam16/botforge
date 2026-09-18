// Ghép "system prompt": persona của bot + khối thông tin do từng plugin đóng góp.
import { GUARDRAILS } from './guardrails.js';
import { protocolBlock } from './protocol.js';
import { localParts } from './time.js';

export function personaText(bot) {
  const lines = [bot.persona?.trim() || `Bạn là ${bot.name}, một trợ lý thân thiện.`];
  if (bot.style?.length) lines.push(`\nPHONG CÁCH:\n${bot.style.map((s) => `- ${s}`).join('\n')}`);
  return lines.join('\n');
}

export function dateBlock(tz, now = new Date()) {
  const p = localParts(tz, now);
  return `BÂY GIỜ: ${p.weekdayVi}, ${p.date}, ${p.hhmm} (giờ ${tz}). "Hôm nay" = ${p.date}.`;
}

export async function buildSystemPrompt(ctx) {
  const { bot, plugins } = ctx;
  const blocks = [personaText(bot), dateBlock(ctx.tz, ctx.now)];

  if (ctx.user?.name) blocks.push(`Bạn đang nói chuyện với: ${ctx.user.name}.`);
  if (ctx.isGroup) blocks.push('Đây là nhóm chat nhiều người — mỗi tin nhắn có ghi tên người nói ở đầu. Trả lời ngắn gọn, đúng người.');

  for (const { plugin, config } of plugins) {
    if (!plugin.promptBlock) continue;
    try {
      const block = await plugin.promptBlock({ ...ctx, config });
      if (block) blocks.push(block);
    } catch (err) {
      console.error(`promptBlock ${plugin.name} lỗi:`, err.message);
    }
  }

  const kinds = plugins.flatMap(({ plugin }) => plugin.dataKinds || []);
  const protocol = protocolBlock(kinds);
  if (protocol) blocks.push(protocol);

  blocks.push(GUARDRAILS);
  blocks.push(
    'ĐỊNH DẠNG: nhắn như người thật trong Telegram — văn xuôi ngắn gọn, xuống dòng rõ ràng. ' +
      'Không dùng bảng markdown, không dùng dấu ** in đậm, không viết lời dẫn kiểu "Dưới đây là...".',
  );
  return blocks.filter(Boolean).join('\n\n');
}

/** Lịch sử hội thoại -> danh sách message cho LLM. */
export function toLlmMessages(history, current) {
  const msgs = history.map((h) => ({
    role: h.role === 'assistant' ? 'assistant' : 'user',
    text: h.who && h.role === 'user' ? `${h.who}: ${h.content}` : h.content,
  }));
  msgs.push(current);
  // Nhiều API đòi lượt đầu phải là "user"
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}
