// Plugin TRÍ NHỚ: bot nhớ chuyện cũ về từng người, mỗi đêm tự chắt lọc lại cho gọn.

const MAX_MEMORY = 6000;

export default {
  name: 'memory',
  label: 'Trí nhớ dài hạn',

  dataKinds: [
    {
      kind: 'memory',
      doc: '{"kind":"memory","text":"điều đáng nhớ lâu dài về người dùng"} — chỉ dùng cho thông tin bền (sở thích, hoàn cảnh, mục tiêu, cam kết). Chuyện vặt trong ngày thì KHÔNG ghi.',
    },
  ],

  async promptBlock({ store, chatId }) {
    const mem = await store.getMemory(chatId);
    if (!mem) return '';
    return `TRÍ NHỚ VỀ NGƯỜI NÀY (đã tích luỹ từ các lần trò chuyện trước)\n${mem.slice(-MAX_MEMORY)}`;
  },

  async applyData({ store, chatId, dateLabel }, item) {
    if (item.kind !== 'memory' || !item.text) return null;
    const cur = await store.getMemory(chatId);
    const line = `- [${dateLabel}] ${String(item.text).trim()}`;
    if (cur.includes(String(item.text).trim())) return null; // đã nhớ rồi thì thôi
    await store.setMemory(chatId, `${cur}\n${line}`.trim());
    return null;
  },

  commands: {
    '/nho': {
      desc: 'Xem bot đang nhớ gì về bạn',
      async run({ store, chatId }) {
        const mem = await store.getMemory(chatId);
        return mem ? `🧠 Mình đang nhớ:\n\n${mem}` : '🧠 Mình chưa ghi nhớ gì về bạn cả.';
      },
    },
    '/quen': {
      desc: 'Xoá sạch trí nhớ về bạn',
      async run({ store, chatId }) {
        await store.setMemory(chatId, '');
        return '🧠 Xong, mình đã quên hết rồi.';
      },
    },
  },

  jobs: [
    {
      id: 'distill',
      atFromConfig: 'distill_at',
      at: '23:15',
      perUser: true,
      silent: true, // chạy âm thầm, không nhắn gì cho người dùng
      async run({ store, chatId, llm, dateLabel }) {
        const rows = await store.history(chatId, 60);
        if (rows.length < 4) return null;
        const cur = await store.getMemory(chatId);
        const convo = rows.map((r) => `${r.role === 'user' ? 'Người dùng' : 'Bot'}: ${r.content}`).join('\n');
        const { text } = await llm.chat({
          system:
            'Bạn là bộ lọc trí nhớ. Nhiệm vụ: viết lại GHI NHỚ DÀI HẠN về người dùng, gộp phần cũ với những gì đáng nhớ trong hội thoại mới. ' +
            'Chỉ giữ thông tin bền (hoàn cảnh, sở thích, mục tiêu, cam kết, sự kiện quan trọng); bỏ chuyện vặt và lời chào. ' +
            'Trả về DUY NHẤT danh sách gạch đầu dòng, tối đa 40 dòng, không thêm lời dẫn.',
          messages: [
            { role: 'user', text: `GHI NHỚ HIỆN CÓ:\n${cur || '(chưa có)'}\n\nHỘI THOẠI GẦN ĐÂY (${dateLabel}):\n${convo}` },
          ],
          maxTokens: 1200,
          temperature: 0.3,
        });
        const cleaned = text.replace(/^```.*$/gm, '').trim();
        if (cleaned.length > 20) await store.setMemory(chatId, cleaned.slice(0, MAX_MEMORY * 2));
        return null;
      },
    },
  ],
};
