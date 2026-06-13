import type { SarvamAI } from 'sarvamai';
import { createSarvamClient } from './sarvamClient';

export type RxTimingSlot = 'morning' | 'afternoon' | 'evening' | 'night';

export type RxDetectedLanguage =
  | 'english'
  | 'hindi'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'marathi'
  | 'bengali'
  | 'gujarati'
  | 'malayalam'
  | 'mixed'
  | 'other';

const VALID_DETECTED_LANGUAGES: ReadonlySet<RxDetectedLanguage> = new Set([
  'english',
  'hindi',
  'tamil',
  'telugu',
  'kannada',
  'marathi',
  'bengali',
  'gujarati',
  'malayalam',
  'mixed',
  'other',
]);

export interface ExtractedRxMedicine {
  name: string;
  dosage: string;
  frequency: string;
  timing: RxTimingSlot[];
  instructions: string;
  language_detected: RxDetectedLanguage;
  confidence: number;
}

export interface ExtractedRxPayload {
  doctor: string | null;
  hospital: string | null;
  date: string | null;
  prescription_language: RxDetectedLanguage;
  medicines: ExtractedRxMedicine[];
}

const PRESCRIPTION_SYSTEM_PROMPT = `You are a multilingual medical prescription parser specialized in Indian prescriptions.

Your job: convert raw OCR text from a prescription (which may be in ANY Indian language) into a strict JSON object with all string values normalized to English.

Output rules (NON-NEGOTIABLE):
- Return ONLY a single JSON object. No markdown, no commentary, no code fences.
- Use this exact shape:
{
  "doctor": string | null,
  "hospital": string | null,
  "date": string | null,
  "prescription_language": "english" | "hindi" | "tamil" | "telugu" | "kannada" | "marathi" | "bengali" | "gujarati" | "malayalam" | "mixed" | "other",
  "medicines": [
    {
      "name": string,
      "dosage": string,
      "frequency": string,
      "timing": ("morning" | "afternoon" | "evening" | "night")[],
      "instructions": string,
      "language_detected": "english" | "hindi" | "tamil" | "telugu" | "kannada" | "marathi" | "bengali" | "gujarati" | "malayalam" | "mixed" | "other",
      "confidence": number
    }
  ]
}
- date must be ISO-8601 (YYYY-MM-DD). If you cannot find one, use null.
- Never invent doctor names, hospital names, or medicines. Use null / empty array instead of guessing.
- Gently correct obvious OCR typos in drug names against well-known Indian medicines (e.g. "Metfornin" -> "Metformin", "Atrovstatin" -> "Atorvastatin", "Pantoprazol" -> "Pantoprazole"). Do NOT add medicines that are not in the OCR text.
- Preserve dosage units verbatim where possible (e.g. "500mg", "5 ml", "1 tab").

English-normalization rules (CRITICAL — Firestore stores English as the canonical copy):
- ALL output strings — name, dosage, frequency, instructions, doctor, hospital — MUST be in English (Latin script).
- Translate Devanagari / Tamil / Telugu / Kannada / Marathi / Bengali / Gujarati / Malayalam tokens to English (e.g. "पैरासिटामोल" -> "Paracetamol", "दिन में दो बार" -> "twice daily", "खाने के बाद" -> "after meals").
- Brand names stay in Latin script as printed (e.g. "पैन्टोसिड" -> "Pantocid", "क्रोसिन" -> "Crocin").
- Keep dosage numerics intact (500mg, 1 tab, 5 ml).
- Standardize frequency tokens to common English forms: "once daily", "twice daily", "three times daily", "four times daily", "every 6 hours", "as needed", "at bedtime".

Per-medicine metadata:
- "language_detected" is the script of the ORIGINAL token in the OCR text for that medicine row (before translation). Use "mixed" only if a single medicine row contains tokens in multiple scripts.
- "confidence" is YOUR estimate (0..1) of how well that medicine row was understood. Use 0.9+ for clean printed rows; 0.6-0.8 for partially garbled rows; 0.3-0.5 for very uncertain rows.

Top-level metadata:
- "prescription_language" is the dominant script across the entire OCR text. Use "mixed" only if no single script dominates.

Decoding Indian Rx shorthand:
- OD = Once Daily -> timing: ["morning"]
- BD or BID = Twice Daily -> timing: ["morning", "night"]
- TID or TDS = Three Times Daily -> timing: ["morning", "afternoon", "night"]
- QID or QDS = Four Times Daily -> timing: ["morning", "afternoon", "evening", "night"]
- HS = At Bedtime -> timing: ["night"]
- AC = Before Meals -> instructions should mention "before food"
- PC = After Meals -> instructions should mention "after food"
- SOS = As Needed -> frequency: "As Needed", timing: []
- 1-0-1 / 1-1-1 patterns: positions are morning-afternoon-night; 1 means take, 0 means skip
- x/7 = for that many days; x/12 = for that many months -> add to instructions

If a row contains a number-dash pattern like "1-0-1" treat it as the timing schedule.
If a row contains only the medicine name with no schedule, set frequency to "" and timing to [].`;

const PRESCRIPTION_USER_PROMPT = (rawText: string) =>
  `Raw OCR text from a prescription is below. Extract the structured prescription JSON now.

OCR TEXT:
"""
${rawText.trim().slice(0, 8000)}
"""

Respond with ONLY a single valid JSON object. Begin your response with "{" and end with "}". Do not include any text, markdown, code fences, comments, or explanations before or after the JSON.`;

// Strip any markdown code fences (anywhere in the string, not just at
// the edges) plus single-line comments. Smart-quote normalization
// converts curly Unicode quotes to ASCII so JSON.parse doesn't choke
// on model output cloned from prose training data.
const sanitizeJsonResponse = (raw: string): string => {
  if (!raw) return '';
  let out = raw;

  // Strip ```json ... ``` (with or without language tag), wherever it appears.
  out = out.replace(/```(?:json|JSON)?\s*([\s\S]*?)```/g, '$1');

  // Normalize smart quotes -> ASCII.
  out = out
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');

  // Strip line comments (// ...). Don't touch URLs because they live
  // inside string literals, not at line-starts before the brace block.
  out = out.replace(/(^|\s)\/\/[^\n]*/g, '$1');

  return out.trim();
};

// Walk the string char-by-char honoring string literals to find the
// matching '}' for the first '{'. More reliable than indexOf+lastIndexOf,
// which fails when there's any '}' inside a string literal earlier than
// the true end (e.g. an instructions field containing "}").
const extractFirstJsonObject = (text: string): string | null => {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
};

// Common LLM JSON sins to scrub before a final JSON.parse retry.
const repairCommonJsonMistakes = (json: string): string =>
  json
    // Trailing commas before } or ]
    .replace(/,(\s*[\]}])/g, '$1')
    // Bare NaN / Infinity (model sometimes emits these for confidence)
    .replace(/\bNaN\b/g, '0.5')
    .replace(/\bInfinity\b/g, '1');

const isoDate = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
};

const coerceDetectedLanguage = (raw: unknown): RxDetectedLanguage => {
  if (typeof raw !== 'string') return 'english';
  const lower = raw.trim().toLowerCase() as RxDetectedLanguage;
  return VALID_DETECTED_LANGUAGES.has(lower) ? lower : 'english';
};

const coerceConfidence = (raw: unknown): number => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.5;
  if (raw < 0) return 0;
  if (raw > 1) return raw > 1 && raw <= 100 ? Math.min(raw / 100, 1) : 1;
  return raw;
};

const sanitizeMedicines = (raw: unknown): ExtractedRxMedicine[] => {
  if (!Array.isArray(raw)) return [];

  const validSlots: RxTimingSlot[] = ['morning', 'afternoon', 'evening', 'night'];
  const slotSet = new Set<string>(validSlots);

  return raw
    .map((entry): ExtractedRxMedicine | null => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const name = typeof e.name === 'string' ? e.name.trim() : '';
      if (!name) return null;

      const dosage = typeof e.dosage === 'string' ? e.dosage.trim() : '';
      const frequency = typeof e.frequency === 'string' ? e.frequency.trim() : '';
      const instructions = typeof e.instructions === 'string' ? e.instructions.trim() : '';

      const timingRaw = Array.isArray(e.timing) ? e.timing : [];
      const timing = timingRaw
        .map((slot) => (typeof slot === 'string' ? slot.toLowerCase().trim() : ''))
        .filter((slot): slot is RxTimingSlot => slotSet.has(slot)) as RxTimingSlot[];

      return {
        name,
        dosage,
        frequency,
        timing,
        instructions,
        language_detected: coerceDetectedLanguage(e.language_detected),
        confidence: coerceConfidence(e.confidence),
      };
    })
    .filter((entry): entry is ExtractedRxMedicine => entry !== null);
};

const inferPrescriptionLanguage = (
  topLevel: unknown,
  medicines: ExtractedRxMedicine[]
): RxDetectedLanguage => {
  const top = coerceDetectedLanguage(topLevel);
  if (top !== 'english' || typeof topLevel === 'string') return top;

  // Top-level missing: infer from medicines.
  if (medicines.length === 0) return 'english';
  const tally = new Map<RxDetectedLanguage, number>();
  for (const m of medicines) {
    tally.set(m.language_detected, (tally.get(m.language_detected) ?? 0) + 1);
  }
  let best: RxDetectedLanguage = 'english';
  let bestCount = 0;
  for (const [lang, count] of tally.entries()) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
};

const normalizePayload = (parsed: any): ExtractedRxPayload => {
  const medicines = sanitizeMedicines(parsed?.medicines);
  return {
    doctor:
      typeof parsed?.doctor === 'string' && parsed.doctor.trim()
        ? parsed.doctor.trim()
        : null,
    hospital:
      typeof parsed?.hospital === 'string' && parsed.hospital.trim()
        ? parsed.hospital.trim()
        : null,
    date: isoDate(parsed?.date),
    prescription_language: inferPrescriptionLanguage(parsed?.prescription_language, medicines),
    medicines,
  };
};

// Multi-stage JSON recovery:
//   1. Sanitize (strip fences anywhere, smart quotes, // comments).
//   2. JSON.parse the whole thing.
//   3. Extract the first balanced {...} block (brace-aware, string-aware)
//      and JSON.parse that.
//   4. Apply repairCommonJsonMistakes to that block and JSON.parse again.
//
// Returns null only when all four attempts fail.
const tryParseJson = (raw: string): any | null => {
  if (!raw) return null;
  const cleaned = sanitizeJsonResponse(raw);

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to extraction
  }

  const candidate = extractFirstJsonObject(cleaned);
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    // fall through to mistake-repair
  }

  try {
    return JSON.parse(repairCommonJsonMistakes(candidate));
  } catch {
    return null;
  }
};

export class SarvamChatService {
  static async completions(request: SarvamAI.ChatCompletionsRequest) {
    const client = createSarvamClient();
    return client.chat.completions(request);
  }

  static async askWithContext(options: {
    context: string;
    question: string;
    languageCode?: string;
  }): Promise<string> {
    const client = createSarvamClient();
    const response = await client.chat.completions({
      model: 'sarvam-30b',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: options.languageCode
            ? `You are a medical document assistant. Answer in ${options.languageCode}. Answer only from the provided context when possible. Keep responses concise, clear, and clinically cautious.`
            : 'You are a medical document assistant. Answer only from the provided context when possible. Use the same language as the user\'s question.',
        },
        {
          role: 'user',
          content: `Context:\n${options.context}\n\nQuestion:\n${options.question}`,
        },
      ],
    });

    return response.choices[0]?.message?.content ?? '';
  }

  // Structured prescription extraction. Sends the raw OCR text to
  // sarvam-30b with a strict JSON schema, retries once with a "repair"
  // prompt if the first response is not valid JSON, and finally returns
  // an empty payload (no fabricated data) if both attempts fail.
  static async extractPrescription(rawText: string): Promise<ExtractedRxPayload> {
    const trimmed = (rawText || '').trim();
    if (!trimmed) {
      return {
        doctor: null,
        hospital: null,
        date: null,
        prescription_language: 'english',
        medicines: [],
      };
    }

    // Sarvam-30b runs hidden reasoning that COUNTS against max_tokens.
    // With reasoning_effort: 'low' the model still burned a 2048-token
    // budget on reasoning and emitted 0 content. The SDK doc says
    // reasoning "can be disabled by explicitly setting to None" — in
    // the wire protocol that's `null`. TS doesn't expose null in the
    // ReasoningEffort union, so we cast.
    const firstResponse = await this.completions({
      model: 'sarvam-30b',
      temperature: 0,
      reasoning_effort: null as any,
      // Generous headroom so even if some reasoning still happens,
      // there's room for a long Rx (~6-10 medicines + metadata).
      max_tokens: 4096,
      messages: [
        { role: 'system', content: PRESCRIPTION_SYSTEM_PROMPT },
        { role: 'user', content: PRESCRIPTION_USER_PROMPT(trimmed) },
      ],
    });

    const firstContent =
      (firstResponse as any)?.choices?.[0]?.message?.content ?? '';
    const firstParsed = tryParseJson(firstContent);
    if (firstParsed) {
      return normalizePayload(firstParsed);
    }

    const firstFinishReason = (firstResponse as any)?.choices?.[0]?.finish_reason;
    console.warn(
      '[SarvamChatService] first prescription parse failed, attempting repair.',
      '\nfinish_reason:',
      firstFinishReason,
      '\nfirstContent (string):',
      JSON.stringify(firstContent),
      '\nfull response wrapper:',
      firstResponse
    );

    // If sarvam-30b returned empty content (finish_reason: 'length' or
    // similar reasoning-budget exhaustion), retrying with the SAME model
    // is pointless — fall through to sarvam-m (legacy 24B, no built-in
    // reasoning, so every token is pure output). We re-issue the full
    // extraction prompt rather than a 'repair' prompt because we have no
    // partial JSON to repair when content is empty.
    const isEmpty = !firstContent || firstContent.trim() === '';
    const fallbackToM = isEmpty || firstFinishReason === 'length';

    try {
      const repairResponse = await this.completions({
        model: fallbackToM ? 'sarvam-m' : 'sarvam-30b',
        temperature: 0,
        reasoning_effort: null as any,
        max_tokens: 4096,
        messages: fallbackToM
          ? [
              { role: 'system', content: PRESCRIPTION_SYSTEM_PROMPT },
              { role: 'user', content: PRESCRIPTION_USER_PROMPT(trimmed) },
            ]
          : [
              {
                role: 'system',
                content:
                  'You repair malformed JSON. Return ONLY a single valid JSON object matching the requested prescription schema, with no commentary or fences.',
              },
              {
                role: 'user',
                content: `The previous response was not valid JSON. Repair it into the prescription schema (doctor, hospital, date, medicines[]).\n\nPREVIOUS:\n${firstContent}`,
              },
            ],
      });

      const repairContent =
        (repairResponse as any)?.choices?.[0]?.message?.content ?? '';
      const repairParsed = tryParseJson(repairContent);
      if (repairParsed) {
        return normalizePayload(repairParsed);
      }
    } catch (err) {
      console.warn('[SarvamChatService] JSON repair attempt failed', err);
    }

    return {
      doctor: null,
      hospital: null,
      date: null,
      prescription_language: 'english',
      medicines: [],
    };
  }
}
