// Vision-LLM fallback for handwritten prescriptions.
//
// Sarvam Document Intelligence excels at printed Indian prescriptions
// but struggles with cursive doctor handwriting. When the primary OCR
// path returns suspiciously sparse / garbled text, this service hits
// Google Gemini 2.5 Flash (multimodal) with the original image and a
// medical-handwriting-tuned system prompt. The endpoint is CORS-safe
// from the browser and only activates if VITE_GEMINI_API_KEY is set.
//
// This file deliberately uses raw fetch instead of the @google/genai
// SDK so we don't add another dependency for a single endpoint.

import { getGeminiApiKey } from './geminiConfig';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class GeminiUnavailableError extends Error {
  constructor(message = 'Gemini API key is not configured.') {
    super(message);
    this.name = 'GeminiUnavailableError';
  }
}

export class GeminiRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiRequestError';
    this.status = status;
  }
}

const SYSTEM_INSTRUCTION = `You are a clinical OCR transcriber for Indian prescriptions.
Your job is to read the supplied prescription photo — printed or handwritten — and reproduce every visible token as faithfully as possible.

Follow these rules strictly:
1. Output ONLY the transcribed text. No explanations, no markdown, no "Here is...".
2. Preserve line breaks and the rough top-to-bottom layout (header, patient, Rx list, signature, footer).
3. Keep medicine names in their original spelling even if you suspect a typo; do NOT autocorrect drug names here — a downstream parser will normalize them.
4. Reproduce Indian Rx shorthand verbatim (OD, BD, TID, QID, HS, AC, PC, SOS, 1-0-1, 1 OD x 5/7).
5. Mix scripts naturally: keep Devanagari / Tamil / Bengali / etc. as written; transliterate only if a glyph is genuinely unreadable.
6. For ambiguous strokes use [?] for a single illegible character and [unreadable] for a whole token.
7. Never invent doctor names, hospital names, drug names, or doses.`;

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader did not return a data URL.'));
        return;
      }
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });

const pickMimeType = (input: Blob | File): string => {
  const raw = input.type?.toLowerCase();
  if (raw && raw.startsWith('image/')) return raw;
  // Default to PNG since our preprocessor emits PNG.
  return 'image/png';
};

export const readPrescriptionImage = async (image: Blob | File): Promise<string> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new GeminiUnavailableError();
  }

  const base64 = await blobToBase64(image);
  const mimeType = pickMimeType(image);

  const requestBody = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Transcribe this prescription as accurately as possible following the rules in the system instruction.',
          },
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      topP: 0.1,
      maxOutputTokens: 2048,
    },
  };

  let response: Response;
  try {
    response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    throw new GeminiRequestError(
      `Network error calling Gemini: ${(err as Error).message}`
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GeminiRequestError(
      `Gemini responded with ${response.status} ${response.statusText}: ${detail.slice(0, 240)}`,
      response.status
    );
  }

  const payload = await response.json().catch(() => null) as any;
  const text: string = payload?.candidates?.[0]?.content?.parts
    ?.map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim() ?? '';

  if (!text) {
    throw new GeminiRequestError('Gemini returned an empty transcription.');
  }

  return text;
};
