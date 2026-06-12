// Prescription OCR pipeline.
//
// Stages, in order:
//   1. Detect input type (PDF vs image).
//      - PDF: try pdfjs first (fast typed-text extraction). If it
//        returns substantial text, skip Sarvam DI to save quota.
//      - Image: preprocess via canvas (grayscale + contrast).
//   2. Primary OCR via Sarvam Document Intelligence (multilingual,
//      layout-preserving). Works on the PDF directly or on the
//      preprocessed image (wrapped in a ZIP under the hood).
//   3. Quality check: if the text is suspiciously short / garbled and
//      we have a Gemini key configured, run the original image through
//      Gemini 2.5 Flash and prefer that transcription.
//   4. Structured extraction via Sarvam Chat (sarvam-30b + strict JSON
//      schema) into { doctor, hospital, date, medicines[] }.
//
// All stages degrade gracefully: any single failure falls back to
// Tesseract.js (already in package.json) for raw OCR, and the final
// payload contains nulls / empty arrays rather than fabricated data.

import { createWorker } from 'tesseract.js';
import { extractTextFromPdf } from './pdfExtractor';
import { preprocessImageForOcr } from './imagePreprocessor';
import { SarvamDocumentService } from './sarvamDocumentService';
import { SarvamChatService } from './sarvamChatService';
import type {
  ExtractedRxMedicine,
  ExtractedRxPayload,
  RxDetectedLanguage,
  RxTimingSlot,
} from './sarvamChatService';
import {
  GeminiRequestError,
  GeminiUnavailableError,
  readPrescriptionImage,
} from './geminiVisionService';
import { isGeminiConfigured } from './geminiConfig';
import { SarvamConfigurationError } from './sarvamErrors';

export type PrescriptionOcrSource =
  | 'sarvam-document-intelligence'
  | 'pdfjs'
  | 'gemini-vision'
  | 'tesseract'
  | 'empty';

export type PrescriptionConfidence = 'high' | 'medium' | 'low';

export interface PrescriptionExtractionResult {
  success: boolean;
  doctor: string | null;
  hospital: string | null;
  date: string | null;
  medicines: ExtractedRxMedicine[]; // canonical English
  rawText: string;
  prescription_language: RxDetectedLanguage;
  confidence: PrescriptionConfidence;
  ocrSource: PrescriptionOcrSource;
  usedHandwritingFallback: boolean;
  warnings: string[];
  errors: string[];
  processingTimeMs: number;
}

const PDF_MIME = 'application/pdf';
const MIN_USEFUL_TEXT_LENGTH = 40;

const isPdf = (file: File): boolean => {
  if (file.type === PDF_MIME) return true;
  return /\.pdf$/i.test(file.name || '');
};

const isImage = (file: File): boolean => {
  const t = file.type?.toLowerCase() || '';
  if (t.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|bmp)$/i.test(file.name || '');
};

// Very lightweight quality heuristic. Sarvam DI on a photo of cursive
// handwriting often returns either an empty md, a tiny string, or text
// dominated by symbols. We DON'T need to perfectly detect handwriting;
// we just need to know when to invoke the vision LLM.
const looksLikeHandwritingOrUnreadable = (text: string): boolean => {
  const cleaned = text.trim();
  if (cleaned.length < MIN_USEFUL_TEXT_LENGTH) return true;

  const alphabetic = cleaned.match(/[\p{L}]/gu)?.length ?? 0;
  const alphabeticRatio = alphabetic / cleaned.length;
  if (alphabeticRatio < 0.45) return true;

  // Count "junky" tokens like a single isolated symbol or 1-2 letter blobs.
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const junkyTokens = tokens.filter((tok) => {
    if (tok.length <= 2 && !/^\d{1,2}$/.test(tok)) return true;
    if (!/[\p{L}\d]/u.test(tok)) return true;
    return false;
  }).length;

  return junkyTokens / tokens.length > 0.5;
};

const runTesseractFallback = async (input: File | Blob): Promise<string> => {
  try {
    const worker = await createWorker('eng');
    const value =
      input instanceof File || input instanceof Blob
        ? URL.createObjectURL(input)
        : (input as unknown as string);
    const ret = await worker.recognize(value);
    await worker.terminate();
    if (typeof value === 'string' && value.startsWith('blob:')) {
      URL.revokeObjectURL(value);
    }
    return ret?.data?.text ?? '';
  } catch (err) {
    console.warn('[prescriptionPipeline] tesseract fallback failed', err);
    return '';
  }
};

const todayIso = () => new Date().toISOString().split('T')[0];

const deriveConfidence = (medicines: ExtractedRxMedicine[]): PrescriptionConfidence => {
  if (medicines.length === 0 || medicines.length === 1) return 'low';
  const avg =
    medicines.reduce((sum, m) => sum + (m.confidence ?? 0.5), 0) / medicines.length;
  if (avg < 0.5) return 'low';
  if (medicines.length >= 3 && avg > 0.8) return 'high';
  return 'medium';
};

interface EmptyResultOptions {
  rawText?: string;
  source?: PrescriptionOcrSource;
  warnings?: string[];
  errors?: string[];
  processingTimeMs?: number;
  success?: boolean;
}

const buildEmptyResult = (opts: EmptyResultOptions = {}): PrescriptionExtractionResult => ({
  success: opts.success ?? false,
  doctor: null,
  hospital: null,
  date: null,
  medicines: [],
  rawText: opts.rawText ?? '',
  prescription_language: 'english',
  confidence: 'low',
  ocrSource: opts.source ?? 'empty',
  usedHandwritingFallback: false,
  warnings: opts.warnings ?? [],
  errors: opts.errors ?? [],
  processingTimeMs: opts.processingTimeMs ?? 0,
});

const finalizeResult = (
  payload: ExtractedRxPayload,
  rawText: string,
  ocrSource: PrescriptionOcrSource,
  usedHandwritingFallback: boolean,
  warnings: string[],
  errors: string[],
  processingTimeMs: number
): PrescriptionExtractionResult => {
  return {
    success: errors.length === 0,
    doctor: payload.doctor,
    hospital: payload.hospital,
    date: payload.date || todayIso(),
    medicines: payload.medicines,
    rawText,
    prescription_language: payload.prescription_language,
    confidence: deriveConfidence(payload.medicines),
    ocrSource,
    usedHandwritingFallback,
    warnings,
    errors,
    processingTimeMs,
  };
};

// Try the Gemini vision pass on an image. Returns null if not
// configured or the call fails; pipeline keeps going either way.
const tryGeminiTranscription = async (
  image: File | Blob,
  warnings: string[]
): Promise<string | null> => {
  if (!isGeminiConfigured()) {
    warnings.push('Gemini vision key not configured — handwriting accuracy may be limited.');
    return null;
  }

  try {
    const text = await readPrescriptionImage(image);
    return text.trim() || null;
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      warnings.push('Gemini vision key not configured — handwriting accuracy may be limited.');
    } else if (err instanceof GeminiRequestError) {
      warnings.push(`Gemini vision call failed (${err.status ?? 'network'}): ${err.message}`);
    } else {
      warnings.push(`Gemini vision call failed: ${(err as Error).message}`);
    }
    return null;
  }
};

const ocrPdf = async (
  file: File,
  warnings: string[]
): Promise<{ rawText: string; source: PrescriptionOcrSource }> => {
  let typedText = '';
  try {
    typedText = (await extractTextFromPdf(file)).trim();
  } catch (err) {
    warnings.push(`pdfjs extraction failed: ${(err as Error).message}`);
  }

  if (typedText && typedText.length >= MIN_USEFUL_TEXT_LENGTH) {
    return { rawText: typedText, source: 'pdfjs' };
  }

  try {
    const sarvamText = (await SarvamDocumentService.extractTextFromSource(file)).trim();
    if (sarvamText) {
      return { rawText: sarvamText, source: 'sarvam-document-intelligence' };
    }
  } catch (err) {
    if (err instanceof SarvamConfigurationError) {
      warnings.push('Sarvam API key not configured — falling back to local OCR.');
    } else {
      warnings.push(`Sarvam Document Intelligence failed: ${(err as Error).message}`);
    }
  }

  const tessText = (await runTesseractFallback(file)).trim();
  return { rawText: tessText, source: tessText ? 'tesseract' : 'empty' };
};

const ocrImage = async (
  file: File,
  warnings: string[]
): Promise<{ rawText: string; source: PrescriptionOcrSource; usedHandwritingFallback: boolean; originalImage: Blob }> => {
  let preprocessed: Blob = file;
  try {
    preprocessed = await preprocessImageForOcr(file);
  } catch (err) {
    warnings.push(`Image preprocessing failed: ${(err as Error).message}`);
  }

  let primaryText = '';
  let primarySource: PrescriptionOcrSource = 'empty';

  try {
    const sarvamResult = await SarvamDocumentService.digitizeImage(preprocessed);
    primaryText = (sarvamResult.extractedText || '').trim();
    primarySource = 'sarvam-document-intelligence';
  } catch (err) {
    if (err instanceof SarvamConfigurationError) {
      warnings.push('Sarvam API key not configured — falling back to local OCR.');
    } else {
      warnings.push(`Sarvam Document Intelligence failed: ${(err as Error).message}`);
    }
  }

  const needsHandwritingPass =
    !primaryText || looksLikeHandwritingOrUnreadable(primaryText);

  let usedHandwritingFallback = false;

  if (needsHandwritingPass) {
    const geminiText = await tryGeminiTranscription(file, warnings);
    if (geminiText && geminiText.length >= MIN_USEFUL_TEXT_LENGTH) {
      primaryText = geminiText;
      primarySource = 'gemini-vision';
      usedHandwritingFallback = true;
    } else if (!primaryText) {
      const tess = (await runTesseractFallback(preprocessed)).trim();
      if (tess) {
        primaryText = tess;
        primarySource = 'tesseract';
      }
    }
  }

  return {
    rawText: primaryText,
    source: primaryText ? primarySource : 'empty',
    usedHandwritingFallback,
    originalImage: file,
  };
};

export const extractPrescription = async (
  file: File
): Promise<PrescriptionExtractionResult> => {
  const t0 = performance.now();
  const warnings: string[] = [];
  const errors: string[] = [];

  const elapsed = () => Math.round(performance.now() - t0);

  // Hard try/catch shell — this function MUST NEVER throw. Any
  // unexpected failure is captured into errors[] and reported as
  // success: false.
  try {
    if (!file) {
      errors.push('No file provided.');
      return buildEmptyResult({ processingTimeMs: elapsed(), errors });
    }

    let rawText = '';
    let ocrSource: PrescriptionOcrSource = 'empty';
    let usedHandwritingFallback = false;

    if (isPdf(file)) {
      const pdfResult = await ocrPdf(file, warnings);
      rawText = pdfResult.rawText;
      ocrSource = pdfResult.source;
    } else if (isImage(file)) {
      const imgResult = await ocrImage(file, warnings);
      rawText = imgResult.rawText;
      ocrSource = imgResult.source;
      usedHandwritingFallback = imgResult.usedHandwritingFallback;
    } else {
      const msg = `Unsupported file type: ${file.type || 'unknown'}.`;
      warnings.push(msg);
      errors.push(msg);
      return buildEmptyResult({ warnings, errors, processingTimeMs: elapsed() });
    }

    if (!rawText.trim()) {
      errors.push('OCR returned no readable text.');
      return buildEmptyResult({
        source: ocrSource,
        warnings,
        errors,
        processingTimeMs: elapsed(),
      });
    }

    let parsed: ExtractedRxPayload = {
      doctor: null,
      hospital: null,
      date: null,
      prescription_language: 'english',
      medicines: [],
    };

    try {
      parsed = await SarvamChatService.extractPrescription(rawText);
    } catch (err) {
      if (err instanceof SarvamConfigurationError) {
        const msg = 'Sarvam API key not configured — structured parsing skipped.';
        warnings.push(msg);
        errors.push(msg);
      } else {
        const msg = `Structured parsing failed: ${(err as Error).message}`;
        warnings.push(msg);
        errors.push(msg);
      }
    }

    return finalizeResult(
      parsed,
      rawText,
      ocrSource,
      usedHandwritingFallback,
      warnings,
      errors,
      elapsed()
    );
  } catch (err) {
    const msg = `Prescription pipeline crashed: ${(err as Error).message}`;
    console.error('[prescriptionPipeline]', err);
    warnings.push(msg);
    errors.push(msg);
    return buildEmptyResult({ warnings, errors, processingTimeMs: elapsed() });
  }
};

// Re-exported for callers that need to render the slot list, etc.
export type { ExtractedRxMedicine, RxDetectedLanguage, RxTimingSlot };
