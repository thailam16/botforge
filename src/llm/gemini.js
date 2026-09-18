// Provider: Google Gemini (Generative Language API). Hỗ trợ đọc ảnh (vision).

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function geminiProvider({ apiKey, model, baseUrl }) {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/$/, '');
  return {
    name: `gemini:${model}`,
    async chat({ system, messages, maxTokens = 2048, temperature = 0.7, signal }) {
      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: toParts(m),
      }));
      const body = {
        contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature },
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };

      const res = await fetch(`${base}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();
      if (!text) {
        const reason = cand?.finishReason || data?.promptFeedback?.blockReason || 'rỗng';
        const err = new Error(`Gemini không trả lời (${reason})`);
        err.status = res.status;
        throw err;
      }
      return { text, raw: data };
    },
  };
}

function toParts(m) {
  const parts = [];
  if (m.text) parts.push({ text: m.text });
  for (const img of m.images || []) {
    parts.push({ inline_data: { mime_type: img.mime || 'image/jpeg', data: img.base64 } });
  }
  if (!parts.length) parts.push({ text: '(trống)' });
  return parts;
}
