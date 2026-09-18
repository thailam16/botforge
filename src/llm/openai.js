// Provider: mọi API tương thích OpenAI — OpenAI, OpenRouter, DeepSeek, Groq,
// Ollama (/v1), hoặc proxy riêng của bạn. Hỗ trợ ảnh qua data URI.

export function openaiProvider({ apiKey, model, baseUrl }) {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  return {
    name: `openai:${model}`,
    async chat({ system, messages, maxTokens = 2048, temperature = 0.7, signal }) {
      const msgs = [];
      if (system) msgs.push({ role: 'system', content: system });
      for (const m of messages) msgs.push({ role: m.role, content: toContent(m) });

      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages: msgs, max_tokens: maxTokens, temperature }),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data?.error?.message || `LLM HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      const text = (data.choices?.[0]?.message?.content || '').trim();
      if (!text) {
        const err = new Error('LLM trả lời rỗng');
        err.status = res.status;
        throw err;
      }
      return { text, raw: data };
    },
  };
}

function toContent(m) {
  if (!m.images?.length) return m.text || '';
  const parts = [];
  if (m.text) parts.push({ type: 'text', text: m.text });
  for (const img of m.images) {
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${img.mime || 'image/jpeg'};base64,${img.base64}` },
    });
  }
  return parts;
}
