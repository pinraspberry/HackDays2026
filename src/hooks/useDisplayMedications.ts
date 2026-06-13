// React hook that wraps prescriptionDisplayService.translateMedicationsForDisplay,
// auto-re-runs on medications / language changes, and guards against
// stale resolutions when the inputs change while a request is in flight.
//
// First paint of a never-before-seen language briefly shows
// English-as-placeholder while isTranslating is true; cached subsequent
// renders are synchronous (no spinner perceived).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import type { LanguageCode } from '../context/SettingsContext';
import {
  translateMedicationsForDisplay,
  type DisplayMedication,
  type MedicationInput,
} from '../services/prescriptionDisplayService';

interface UseDisplayMedicationsResult {
  displayMedications: DisplayMedication[];
  isTranslating: boolean;
  error: Error | null;
}

const buildSyncFallback = (
  medications: MedicationInput[],
  language: LanguageCode
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
    targetLanguage: language,
  }));

// Stable identity for the inputs so the effect doesn't re-fire on
// every parent re-render. Hash of the canonical English fields.
const inputSignature = (medications: MedicationInput[]): string => {
  if (medications.length === 0) return '[]';
  return medications
    .map(
      (m) =>
        `${m.id ?? ''}::${m.name}::${m.dosage}::${m.frequency}::${m.instructions}`
    )
    .join('||');
};

export const useDisplayMedications = (
  medications: MedicationInput[] | null | undefined,
  languageOverride?: LanguageCode
): UseDisplayMedicationsResult => {
  const { language: contextLanguage } = useSettings();
  const language = languageOverride ?? contextLanguage;

  const safeMedications = medications ?? [];
  const signature = useMemo(() => inputSignature(safeMedications), [safeMedications]);

  const [displayMedications, setDisplayMedications] = useState<DisplayMedication[]>(
    () => buildSyncFallback(safeMedications, language)
  );
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Used to discard stale resolutions when inputs change mid-flight.
  const runIdRef = useRef(0);

  useEffect(() => {
    const runId = ++runIdRef.current;

    if (safeMedications.length === 0) {
      setDisplayMedications([]);
      setIsTranslating(false);
      setError(null);
      return;
    }

    // English is synchronous — no async work.
    if (language === 'en') {
      setDisplayMedications(buildSyncFallback(safeMedications, language));
      setIsTranslating(false);
      setError(null);
      return;
    }

    // Render English immediately so the UI isn't blank, then swap in
    // translations as soon as they arrive (or stay English if Sarvam
    // is down — the service falls back internally).
    setDisplayMedications(buildSyncFallback(safeMedications, language));
    setIsTranslating(true);
    setError(null);

    translateMedicationsForDisplay({ medications: safeMedications, targetLanguage: language })
      .then((next) => {
        if (runId !== runIdRef.current) return; // stale resolution, discard
        setDisplayMedications(next);
        setIsTranslating(false);
      })
      .catch((err) => {
        if (runId !== runIdRef.current) return;
        console.warn('[useDisplayMedications] translation pipeline error', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsTranslating(false);
      });
    // signature captures meaningful input identity; safeMedications is only
    // read inside .then via the closure created at effect-run time, which is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, language]);

  return { displayMedications, isTranslating, error };
};
