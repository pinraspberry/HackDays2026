// Runtime + env-driven configuration for the Gemini vision fallback.
// Mirrors src/services/sarvamConfig.ts so the rest of the app has a
// consistent shape: env var by default, optional runtime override
// (e.g. user types their own key in Settings without rebuilding).

let runtimeGeminiApiKey: string | null = null;

export const getGeminiApiKey = (): string | null => {
  return (
    runtimeGeminiApiKey ||
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
    null
  );
};

export const setGeminiApiKeyOverride = (apiKey: string) => {
  runtimeGeminiApiKey = apiKey.trim() || null;
};

export const clearGeminiApiKeyOverride = () => {
  runtimeGeminiApiKey = null;
};

export const isGeminiConfigured = (): boolean => !!getGeminiApiKey();
