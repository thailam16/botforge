import { geminiProvider } from './gemini.js';
import { openaiProvider } from './openai.js';

const FACTORIES = { gemini: geminiProvider, openai: openaiProvider };

/**
 * Dựng "bộ não" cho bot từ cấu hình YAML + biến môi trường.
 *
 * Khoá API KHÔNG BAO GIỜ nằm trong file YAML — YAML chỉ ghi TÊN biến môi trường,
 * còn giá trị thật nằm trong Cloudflare Secret (hoặc .env ở máy bạn).
 *
 * Nếu khai báo `fallback`, bot tự chuyển sang nhà dự phòng khi nhà chính hết lượt.
 * Nhà nào ghi `vision: false` sẽ bị bỏ qua ở những lượt có ảnh.
 */
export function createLLM(bot, env) {
  const chain = [bot.llm, ...(bot.llm?.fallback ? [bot.llm.fallback] : [])]
    .map((cfg) => buildOne(cfg, env))
    .filter(Boolean);

  // Thiếu khoá thì KHÔNG ném lỗi ngay: bot vẫn phải trả lời được /status và /help
  // để chủ bot biết đường sửa, thay vì im lặng như chết.
  if (!chain.length) {
    return {
      providers: ['(chưa cấu hình khoá API)'],
      canSeeImages: false,
      async chat() {
        throw Object.assign(new Error(`Bot "${bot.key}" chưa có khoá API cho ${bot.llm?.provider}.`), { config: true });
      },
    };
  }

  return {
    providers: chain.map((p) => p.name),
    canSeeImages: chain.some((p) => p.vision),
    async chat(args) {
      const needsVision = (args.messages || []).some((m) => m.images?.length);
      const usable = needsVision ? chain.filter((p) => p.vision) : chain;
      if (!usable.length) {
        throw Object.assign(new Error('Không có nhà cung cấp nào đọc được ảnh.'), { noVision: true });
      }

      let lastErr;
      for (const provider of usable) {
        try {
          const out = await provider.chat(args);
          return { ...out, provider: provider.name };
        } catch (err) {
          lastErr = err;
          if (!isRetryable(err)) throw err;
        }
      }
      throw lastErr;
    },
  };
}

function buildOne(cfg, env) {
  if (!cfg) return null;
  const factory = FACTORIES[cfg.provider];
  if (!factory) throw new Error(`Không biết provider "${cfg.provider}" (chỉ có: gemini, openai)`);

  const defaults = cfg.provider === 'gemini'
    ? { key: 'GEMINI_API_KEY', base: 'GEMINI_BASE_URL' }
    : { key: 'LLM_API_KEY', base: 'LLM_BASE_URL' };

  const apiKey = env[cfg.api_key_env || defaults.key] || env[cfg.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'];
  const baseUrl = env[cfg.base_url_env || defaults.base] || env[cfg.provider === 'gemini' ? '' : 'OPENAI_BASE_URL'] || cfg.base_url;

  // Máy chủ tự dựng (Ollama…) có thể không cần khoá, nhưng dịch vụ công thì bắt buộc.
  if (!apiKey && !baseUrl) return null;

  const provider = factory({ apiKey, model: cfg.model, baseUrl });
  // Mặc định coi là xem được ảnh, trừ khi cấu hình nói không.
  provider.vision = cfg.vision !== false;
  return provider;
}

/** Lỗi tạm thời (hết lượt, quá tải, mạng) thì đáng để thử nhà dự phòng. */
export function isRetryable(err) {
  const status = err?.status;
  if (status === 429 || status === 529 || (status >= 500 && status < 600)) return true;
  return /rate limit|quota|overload|unavailable|timeout|network|fetch failed/i.test(err?.message || '');
}
