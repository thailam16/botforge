import { geminiProvider } from './gemini.js';
import { openaiProvider } from './openai.js';

const FACTORIES = { gemini: geminiProvider, openai: openaiProvider };

/**
 * Dựng một "bộ não" cho bot từ cấu hình YAML + biến môi trường Worker.
 * Nếu bot khai báo `llm.fallback`, provider chính hỏng sẽ tự chuyển sang dự phòng.
 */
export function createLLM(bot, env) {
  const chain = [bot.llm, ...(bot.llm.fallback ? [bot.llm.fallback] : [])]
    .map((cfg) => buildOne(cfg, env))
    .filter(Boolean);

  // Thiếu khoá thì KHÔNG ném lỗi ngay: bot vẫn phải trả lời được /status và /help
  // để chủ bot biết đường sửa, thay vì im lặng như chết.
  if (!chain.length) {
    return {
      providers: ['(chưa cấu hình khoá API)'],
      async chat() {
        throw Object.assign(new Error(`Bot "${bot.key}" chưa có khoá API cho ${bot.llm.provider}.`), { config: true });
      },
    };
  }

  return {
    providers: chain.map((p) => p.name),
    async chat(args) {
      let lastErr;
      for (const provider of chain) {
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
  const keyEnv = cfg.api_key_env || (cfg.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY');
  const apiKey = env[keyEnv];
  const baseUrl = cfg.base_url || env[cfg.base_url_env || (cfg.provider === 'gemini' ? 'GEMINI_BASE_URL' : 'OPENAI_BASE_URL')];
  // Provider tự host (Ollama…) có thể không cần key, nhưng dịch vụ công thì cần.
  if (!apiKey && !baseUrl) return null;
  return factory({ apiKey, model: cfg.model, baseUrl });
}

/** Lỗi tạm thời (hết lượt, quá tải, mạng) thì đáng để thử provider dự phòng. */
export function isRetryable(err) {
  const status = err?.status;
  if (status === 429 || status === 529 || (status >= 500 && status < 600)) return true;
  return /rate limit|quota|overload|unavailable|timeout|network|fetch failed/i.test(err?.message || '');
}
