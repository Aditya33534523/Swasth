/**
 * LLM server settings — where to send chat completions and which model
 * name to request. Stored as a single plain (non-user-namespaced)
 * localStorage key, deliberately separate from storage.ts's
 * swasthsetu/{userId}/... namespace: this is a device/deployment setting
 * (which server this browser talks to), not personal health data, so it
 * should survive logout and not get swept by deleteAccount().
 */

export interface LLMSettings {
  /** Empty string means "use llm.ts's default (/llm-api, proxied to
   *  Ollama on localhost:11434)". Only set this to override — e.g. pointing at a
   *  different local server or a remote OpenAI-compatible endpoint. */
  baseUrl: string;
  model: string;
}

const KEY = 'swasthsetu-llm-settings';

const DEFAULTS: LLMSettings = { baseUrl: '', model: 'hf.co/ggml-org/gemma-4-E4B-it-GGUF:Q4_0' };

export function getLLMSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULTS.baseUrl,
      model:
        typeof parsed.model === 'string' && parsed.model.trim()
          ? parsed.model.trim()
          : DEFAULTS.model,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLLMSettings(settings: LLMSettings): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      baseUrl: settings.baseUrl.trim(),
      model: settings.model.trim() || DEFAULTS.model,
    }),
  );
}

export function resetLLMSettings(): void {
  localStorage.removeItem(KEY);
}
