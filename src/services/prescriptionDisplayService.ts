// Render-time translation layer for medications.
//
// Firestore stores everything in canonical English (medicine name,
// dosage, frequency, instructions). When the UI needs to render a
// medication, it calls translateMedicationsForDisplay(...) here, which:
//
//   1. Skips translation entirely when targetLanguage === 'en'.
//   2. Looks up each (field, englishText, language) triple in an
//      in-memory cache that mirrors a small localStorage entry — so a
//      language switch is instant after the first paint, even across
//      tab reloads.
//   3. For unique cache-miss strings, fans out parallel calls to
//      Sarvam's text translation endpoint (mayura:v1 / sarvam-translate:v1
//      compatible).
//   4. On any per-string translation failure, falls back to the
//      English value for that field and logs a warning. Never throws.

import type { LanguageCode } from '../context/SettingsContext';
import { SarvamTranslationService } from './sarvamTranslationService';
import type { RxTimingSlot } from './sarvamChatService';

// ---------- Types ----------

export interface MedicationInput {
  name: string;
  dosage: string;
  frequency: string;
  timing: RxTimingSlot[];
  instructions: string;
  // ExtractedRxMedicine adds these; Medication doesn't. Both are accepted.
  id?: string;
  startDate?: string;
}

export interface DisplayMedication {
  // Canonical English (mirrored from input, unchanged)
  name: string;
  dosage: string;
  frequency: string;
  timing: RxTimingSlot[];
  instructions: string;
  id?: string;
  startDate?: string;
  // Translated for UI rendering
  name_display: string;
  dosage_display: string;
  frequency_display: string;
  instructions_display: string;
  targetLanguage: LanguageCode;
}

export interface TranslateRequest {
  medications: MedicationInput[];
  targetLanguage: LanguageCode;
}

// ---------- Language code mapping ----------

// Sarvam BCP-47 codes; 'en' short-circuits before this map is consulted.
const SARVAM_LANGUAGE_CODES: Record<Exclude<LanguageCode, 'en'>, string> = {
  hi: 'hi-IN',
  ta: 'ta-IN',
  gu: 'gu-IN',
  mr: 'mr-IN',
  te: 'te-IN',
  bn: 'bn-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
};

// ---------- Cache ----------

interface CacheEntry {
  value: string;
  expiresAt: number; // epoch ms
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_ENTRIES = 200;
const CACHE_STORAGE_KEY = 'pulse_translation_cache_v1';

const cacheKey = (
  field: 'name' | 'dosage' | 'frequency' | 'instructions',
  english: string,
  target: LanguageCode
): string => `${target}|${field}|${english}`;

// Per-tab Map. Hot path: O(1) lookups. Hydrated from localStorage on
// first import so reloads don't lose accumulated translations.
const memoryCache = new Map<string, CacheEntry>();

const hydrateFromStorage = () => {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.value === 'string' && typeof v.expiresAt === 'number' && v.expiresAt > now) {
        memoryCache.set(k, v);
      }
    }
  } catch (err) {
    console.warn('[prescriptionDisplay] cache hydrate failed', err);
  }
};

let hydrated = false;
const ensureHydrated = () => {
  if (hydrated) return;
  hydrated = true;
  hydrateFromStorage();
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
const schedulePersist = () => {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      // LRU-ish trim: if over the cap, drop the entries whose expiresAt
      // is soonest (i.e. least-recently-set, since each set bumps TTL).
      if (memoryCache.size > CACHE_MAX_ENTRIES) {
        const entries = Array.from(memoryCache.entries()).sort(
          (a, b) => a[1].expiresAt - b[1].expiresAt
        );
        const toDrop = entries.length - CACHE_MAX_ENTRIES;
        for (let i = 0; i < toDrop; i += 1) memoryCache.delete(entries[i][0]);
      }
      const dump: Record<string, CacheEntry> = {};
      for (const [k, v] of memoryCache.entries()) dump[k] = v;
      window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(dump));
    } catch (err) {
      console.warn('[prescriptionDisplay] cache persist failed', err);
    }
  }, 250);
};

const cacheGet = (key: string): string | null => {
  ensureHydrated();
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
};

const cacheSet = (key: string, value: string) => {
  memoryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  schedulePersist();
};

// ---------- Translation ----------

const FIELD_NAMES = ['name', 'dosage', 'frequency', 'instructions'] as const;
type FieldName = (typeof FIELD_NAMES)[number];

interface UniqueRequest {
  field: FieldName;
  english: string;
  cacheKey: string;
}

const translateOne = async (
  text: string,
  targetBcp47: string
): Promise<string | null> => {
  try {
    const response = await SarvamTranslationService.translate({
      input: text,
      source_language_code: 'en-IN',
      target_language_code: targetBcp47 as any,
    });
    const translated = (response as any)?.translated_text;
    if (typeof translated === 'string' && translated.trim()) {
      return translated;
    }
    return null;
  } catch (err) {
    console.warn('[prescriptionDisplay] translation failed', { text, targetBcp47, err });
    return null;
  }
};

const buildPassThroughResult = (
  medications: MedicationInput[],
  targetLanguage: LanguageCode
): DisplayMedication[] =>
  medications.map((m) => ({
    name: m.name,
    dosage: m.dosage,
    frequency: m.frequency,
    timing: m.timing,
    instructions: m.instructions,
    id: m.id,
    startDate: m.startDate,
    name_display: m.name,
    dosage_display: m.dosage,
    frequency_display: m.frequency,
    instructions_display: m.instructions,
    targetLanguage,
  }));

export const translateMedicationsForDisplay = async (
  request: TranslateRequest
): Promise<DisplayMedication[]> => {
  const { medications, targetLanguage } = request;

  // English-target or empty input: zero-cost pass-through.
  if (!medications || medications.length === 0) return [];
  if (targetLanguage === 'en') {
    return buildPassThroughResult(medications, targetLanguage);
  }

  const bcp47 = SARVAM_LANGUAGE_CODES[targetLanguage];
  if (!bcp47) {
    console.warn(`[prescriptionDisplay] no Sarvam BCP-47 mapping for ${targetLanguage}; rendering English.`);
    return buildPassThroughResult(medications, targetLanguage);
  }

  ensureHydrated();

  // Phase 1: collect unique cache-misses across all medicines/fields.
  const uniqueRequests = new Map<string, UniqueRequest>();
  for (const med of medications) {
    for (const field of FIELD_NAMES) {
      const english = (med as Record<FieldName, string>)[field] ?? '';
      if (!english.trim()) continue;
      const key = cacheKey(field, english, targetLanguage);
      if (cacheGet(key) !== null) continue;
      if (uniqueRequests.has(key)) continue;
      uniqueRequests.set(key, { field, english, cacheKey: key });
    }
  }

  // Phase 2: fan out cache-miss translations in parallel.
  if (uniqueRequests.size > 0) {
    const settled = await Promise.allSettled(
      Array.from(uniqueRequests.values()).map(async (req) => {
        const translated = await translateOne(req.english, bcp47);
        return { req, translated };
      })
    );

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const { req, translated } = result.value;
      // On API failure, store the English text in the cache so we don't
      // hammer the API again for the same string on every re-render.
      cacheSet(req.cacheKey, translated ?? req.english);
    }
  }

  // Phase 3: assemble DisplayMedication[] from cache (with English fallback).
  return medications.map((m): DisplayMedication => {
    const lookup = (field: FieldName): string => {
      const english = (m as Record<FieldName, string>)[field] ?? '';
      if (!english.trim()) return english;
      return cacheGet(cacheKey(field, english, targetLanguage)) ?? english;
    };

    return {
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      timing: m.timing,
      instructions: m.instructions,
      id: m.id,
      startDate: m.startDate,
      name_display: lookup('name'),
      dosage_display: lookup('dosage'),
      frequency_display: lookup('frequency'),
      instructions_display: lookup('instructions'),
      targetLanguage,
    };
  });
};

// Exposed for tests / debugging only.
export const __clearTranslationCacheForTests = () => {
  memoryCache.clear();
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    try {
      window.localStorage.removeItem(CACHE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
};
