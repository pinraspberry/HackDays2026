// Thin compatibility shim that keeps the original OcrService import
// site stable while delegating to the new prescription pipeline.
//
// Pre-refactor this file contained a regex + 4-medicine if/else parser
// that hallucinated a "Dr. Sandeep Jha" prescription on every failure.
// All of that has been removed. The pipeline now returns honest nulls
// for fields it cannot detect and a real medicines array.

import {
  extractPrescription,
  type PrescriptionExtractionResult,
} from './prescriptionPipeline';

export interface ExtractedPrescription {
  doctor: string;
  hospital: string;
  date: string;
  medicines: {
    name: string;
    dosage: string;
    frequency: string;
    timing: ('morning' | 'afternoon' | 'evening' | 'night')[];
    instructions: string;
  }[];
  rawText: string;
  // Diagnostic fields populated by the pipeline. Optional so existing
  // consumers compile without changes.
  ocrSource?: PrescriptionExtractionResult['ocrSource'];
  usedHandwritingFallback?: boolean;
  warnings?: string[];
}

const NOT_DETECTED_LABEL = '—';

const todayIso = () => new Date().toISOString().split('T')[0];

const toLegacyShape = (result: PrescriptionExtractionResult): ExtractedPrescription => ({
  doctor: result.doctor || NOT_DETECTED_LABEL,
  hospital: result.hospital || NOT_DETECTED_LABEL,
  date: result.date || todayIso(),
  medicines: result.medicines.map((m) => ({
    name: m.name,
    dosage: m.dosage,
    frequency: m.frequency,
    timing: m.timing,
    instructions: m.instructions,
  })),
  rawText: result.rawText,
  ocrSource: result.ocrSource,
  usedHandwritingFallback: result.usedHandwritingFallback,
  warnings: result.warnings,
});

export class OcrService {
  // Runs the full prescription pipeline on a file (image or PDF) and
  // returns the legacy shape consumed by Medicines.tsx.
  public static async scanPrescription(imageSrc: File): Promise<ExtractedPrescription> {
    const result = await extractPrescription(imageSrc);
    return toLegacyShape(result);
  }

  // Demo-only canned data used by the "Mock Scan" button. Kept so the
  // demo path still works without any backend / API keys configured.
  public static generateMockPrescription(): ExtractedPrescription {
    return {
      doctor: 'Dr. Sandeep Jha',
      hospital: 'Medanta Medicity, Gurugram',
      date: todayIso(),
      medicines: [
        {
          name: 'Metformin (500mg)',
          dosage: '1 Tablet',
          frequency: 'Twice Daily',
          timing: ['morning', 'night'],
          instructions: 'With meals',
        },
        {
          name: 'Atorvastatin (20mg)',
          dosage: '1 Tablet',
          frequency: 'Once Daily',
          timing: ['night'],
          instructions: 'After dinner',
        },
        {
          name: 'Pantocid (40mg)',
          dosage: '1 Tablet',
          frequency: 'Once Daily',
          timing: ['morning'],
          instructions: 'Empty stomach before breakfast',
        },
      ],
      rawText:
        'MEDANTA MEDICITY\nSector 38, Gurugram\nDr. Sandeep Jha, MD Cardiology\nDate: 2026-06-02\n\nRx\n1. Tab. Pantocid 40mg -- 1 OD -- Before Breakfast\n2. Tab. Metformin 500mg -- BD -- With Breakfast & Dinner\n3. Tab. Atorvastatin 20mg -- OD -- At Bedtime',
      ocrSource: 'sarvam-document-intelligence',
      usedHandwritingFallback: false,
      warnings: [],
    };
  }
}
