// Lớp mỏng gọi Telegram Bot API. Không phụ thuộc thư viện ngoài.

const API = 'https://api.telegram.org';

export class Telegram {
  constructor(token) {
    this.token = token;
  }

  async call(method, payload = {}) {
    const res = await fetch(`${API}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Telegram ${method}: không đọc được phản hồi (HTTP ${res.status})`);
    }
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || 'lỗi không rõ'}`);
    return data.result;
  }

  /** Telegram chặn tin dài hơn 4096 ký tự nên ta tự cắt theo dòng. */
  async sendMessage(chatId, text, opts = {}) {
    const parts = splitText(String(text || '').trim() || '…');
    let last = null;
    for (const part of parts) {
      last = await this.call('sendMessage', {
        chat_id: chatId,
        text: part,
        disable_web_page_preview: true,
        ...opts,
      }).catch(async (err) => {
        // parse_mode sai (LLM viết HTML/Markdown lỗi) thì gửi lại dạng thô
        if (opts.parse_mode && /parse|entity/i.test(err.message)) {
          return this.call('sendMessage', { chat_id: chatId, text: part, disable_web_page_preview: true });
        }
        throw err;
      });
    }
    return last;
  }

  sendChatAction(chatId, action = 'typing') {
    return this.call('sendChatAction', { chat_id: chatId, action }).catch(() => null);
  }

  setMessageReaction(chatId, messageId, emoji) {
    return this.call('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: emoji ? [{ type: 'emoji', emoji }] : [],
    }).catch(() => null);
  }

  leaveChat(chatId) {
    return this.call('leaveChat', { chat_id: chatId }).catch(() => null);
  }

  getMe() {
    return this.call('getMe');
  }

  /** Tải file người dùng gửi về dạng base64 để đưa cho LLM đọc ảnh. */
  async downloadFile(fileId, maxBytes = 8 * 1024 * 1024) {
    const file = await this.call('getFile', { file_id: fileId });
    const res = await fetch(`${API}/file/bot${this.token}/${file.file_path}`);
    if (!res.ok) throw new Error(`Tải file Telegram lỗi HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) throw new Error('File quá lớn');
    return {
      bytes: buf,
      base64: bytesToBase64(new Uint8Array(buf)),
      mime: guessMime(file.file_path),
      path: file.file_path,
    };
  }

  setWebhook(url, secret) {
    return this.call('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
      drop_pending_updates: true,
    });
  }
}

export function splitText(text, limit = 3800) {
  if (text.length <= limit) return [text];
  const out = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if (buf.length + line.length + 1 > limit) {
      if (buf) out.push(buf);
      buf = '';
      // một dòng đơn lẻ vẫn có thể dài hơn giới hạn
      let rest = line;
      while (rest.length > limit) {
        out.push(rest.slice(0, limit));
        rest = rest.slice(limit);
      }
      buf = rest;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function guessMime(path = '') {
  const ext = path.split('.').pop().toLowerCase();
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      heic: 'image/heic',
      pdf: 'application/pdf',
    }[ext] || 'application/octet-stream'
  );
}
