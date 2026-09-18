// "Giao thức dữ liệu": LLM vừa trả lời người dùng, vừa phát ra các dòng
//   BOT_DATA: {"kind":"meal", ...}
// Node đọc các dòng này để ghi vào CSDL — số liệu do code tính, không để LLM tự bịa.

// Bắt MỌI dòng bắt đầu bằng BOT_DATA: — kể cả JSON hỏng — để không lọt ra ngoài cho người dùng thấy.
const LINE = /^\s*BOT_DATA:\s*(.*)$/i;

/** Tách phần trả lời cho người dùng và danh sách bản ghi dữ liệu. */
export function parseReply(raw) {
  const data = [];
  const visible = [];
  for (const line of String(raw || '').split('\n')) {
    const m = line.match(LINE);
    if (!m) {
      visible.push(line);
      continue;
    }
    try {
      const obj = JSON.parse(m[1]);
      if (obj && typeof obj === 'object' && obj.kind) data.push(obj);
    } catch {
      // JSON hỏng thì bỏ qua, vẫn không hiện dòng thô cho người dùng
    }
  }
  return { text: visible.join('\n').replace(/\n{3,}/g, '\n\n').trim(), data };
}

/** Mô tả giao thức nhét vào system prompt, chỉ liệt kê những `kind` plugin đang bật. */
export function protocolBlock(kinds) {
  if (!kinds.length) return '';
  const lines = kinds.map((k) => `- ${k.kind}: ${k.doc}`);
  return [
    'GIAO THỨC GHI DỮ LIỆU',
    'Khi trong tin nhắn có dữ liệu cần lưu, hãy viết THÊM các dòng riêng ở CUỐI câu trả lời:',
    'BOT_DATA: {"kind":"...", ...}',
    'Quy tắc bắt buộc:',
    '- Mỗi bản ghi một dòng, JSON hợp lệ trên đúng một dòng, không bọc trong ``` và không thêm chữ nào khác trên dòng đó.',
    '- Nhiều bản ghi thì viết nhiều dòng.',
    '- KHÔNG nhắc tới BOT_DATA trong phần nói chuyện với người dùng.',
    '- Chỉ ghi khi thật sự có dữ liệu mới; thiếu dữ kiện thì hỏi lại thay vì đoán bừa.',
    'Các loại được phép:',
    ...lines,
  ].join('\n');
}
