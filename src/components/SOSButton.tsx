// PULSE — modified
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ShieldAlert,
  X,
  AlertTriangle,
  Loader2,
  Square,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import { useRole, useActivePatient } from '../context/RoleContext';
import { useSettings } from '../context/SettingsContext';
import { processSosVoiceNote } from '../services/sarvamSOSPipelineService';

type Phase =
  | 'idle'
  | 'pressing'
  | 'recording'
  | 'processing'
  | 'sent'
  | 'error';

const HOLD_MS = 2000;
const MAX_RECORDING_MS = 30_000;
const RING_SIZE = 88;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_RADIUS;

type LangKey = 'hi' | 'ta' | 'en';

interface PhraseSet {
  srLabel: string;
  helper: string;
  recordingTitle: string;
  recordingHint: string;
  stopAndSend: string;
  cancel: string;
  processing: string;
  processingHint: string;
  sent: string;
  errorTitle: string;
  errorMicDenied: string;
  errorPipeline: string;
  noCaregiver: string;
  retry: string;
  dismiss: string;
}

const PHRASES: Record<LangKey, PhraseSet> = {
  hi: {
    srLabel: 'आपातकालीन SOS — 2 सेकंड दबाए रखें',
    helper: 'दबाए रखें',
    recordingTitle: 'अपनी समस्या बोलिए',
    recordingHint: '30 सेकंड तक रिकॉर्ड कर सकते हैं। पूरा हो जाए तो "भेजें" दबाएँ।',
    stopAndSend: 'रोकें और भेजें',
    cancel: 'रद्द करें',
    processing: 'आपका संदेश समझा जा रहा है…',
    processingHint: 'सर्वम AI आपके संदेश का विश्लेषण कर रहा है।',
    sent: 'आपके केयरगिवर को सूचित कर दिया गया है',
    errorTitle: 'अलर्ट नहीं भेजा जा सका',
    errorMicDenied: 'माइक्रोफोन की अनुमति नहीं मिली। ब्राउज़र में अनुमति दीजिए।',
    errorPipeline: 'अभी नेटवर्क में परेशानी है। कृपया फिर कोशिश करें।',
    noCaregiver:
      'कोई केयरगिवर लिंक नहीं है। पहले "केयरगिवर लिंक" टैब से किसी को जोड़ें।',
    retry: 'फिर कोशिश करें',
    dismiss: 'बंद करें',
  },
  ta: {
    srLabel: 'அவசர SOS — 2 விநாடிகள் அழுத்திப் பிடிக்கவும்',
    helper: 'அழுத்திப் பிடிக்கவும்',
    recordingTitle: 'உங்கள் சிக்கலை சொல்லுங்கள்',
    recordingHint:
      '30 விநாடிகள் வரை பதிவு செய்யலாம். முடிந்ததும் "அனுப்பு" அழுத்தவும்.',
    stopAndSend: 'நிறுத்தி அனுப்பு',
    cancel: 'ரத்து செய்',
    processing: 'உங்கள் செய்தி பகுப்பாய்வு செய்யப்படுகிறது…',
    processingHint: 'Sarvam AI உங்கள் செய்தியை ஆய்வு செய்கிறது.',
    sent: 'உங்கள் காப்பாளருக்கு அறிவிக்கப்பட்டது',
    errorTitle: 'எச்சரிக்கையை அனுப்ப முடியவில்லை',
    errorMicDenied: 'மைக்ரோபோன் அனுமதி மறுக்கப்பட்டது.',
    errorPipeline: 'பிணைய சிக்கல். மீண்டும் முயற்சிக்கவும்.',
    noCaregiver: 'காப்பாளர் இணைக்கப்படவில்லை. முதலில் ஒருவரை இணைக்கவும்.',
    retry: 'மீண்டும் முயற்சிக்கவும்',
    dismiss: 'மூடு',
  },
  en: {
    srLabel: 'Emergency SOS — hold for 2 seconds',
    helper: 'Hold to record',
    recordingTitle: 'Speak your concern',
    recordingHint:
      'Up to 30 seconds. Tap "Stop & Send" when you are done, or "Cancel" to discard.',
    stopAndSend: 'Stop & Send',
    cancel: 'Cancel',
    processing: 'Analysing your message…',
    processingHint: 'Sarvam AI is reviewing your voice note.',
    sent: 'Your caregiver has been notified',
    errorTitle: 'Could not send the alert',
    errorMicDenied:
      'Microphone permission was denied. Please enable it in your browser.',
    errorPipeline: 'Network issue while sending. Please try again.',
    noCaregiver:
      'No caregiver linked yet. Add one from the "Link Caregiver" tab first.',
    retry: 'Try again',
    dismiss: 'Dismiss',
  },
};

const formatSeconds = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

/**
 * Patient-only SOS entry point. Long-press 2s to open the voice
 * recording modal; the modal records up to 30s of audio, runs the
 * Sarvam SOS pipeline, then writes a single `sosEvents` document
 * which fans out to the caregiver via the SOSContext snapshot.
 */
export const SOSButton: React.FC = () => {
  const { user } = useFirebase();
  const { role, profile } = useRole();
  const { isCaregiverViewing } = useActivePatient();
  const { language } = useSettings();

  const [phase, setPhase] = useState<Phase>('idle');
  const [pressProgress, setPressProgress] = useState(0);
  const [recordedMs, setRecordedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const triggeredRef = useRef<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const recordingMaxTimeoutRef = useRef<number | null>(null);
  // Cancellation flag so a stopped MediaRecorder we *cancelled* never
  // proceeds into the AI pipeline (the onstop handler reads this).
  const cancelledRef = useRef<boolean>(false);

  const langKey: LangKey =
    language === 'hi' ? 'hi' : language === 'ta' ? 'ta' : 'en';
  const labels = PHRASES[langKey];

  const cancelLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopMediaTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const clearRecordingTimers = useCallback(() => {
    if (recordingTimerRef.current != null) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingMaxTimeoutRef.current != null) {
      clearTimeout(recordingMaxTimeoutRef.current);
      recordingMaxTimeoutRef.current = null;
    }
  }, []);

  // Run the Sarvam pipeline on the captured audio. Called from the
  // MediaRecorder onstop handler when the user actively sent the note
  // (cancelled === false).
  const processCapturedAudio = useCallback(
    async (blob: Blob) => {
      if (!user) return;
      const linkedCaregiverIds = profile?.linkedCaregiverIds ?? [];
      const caregiverId = linkedCaregiverIds[0];

      if (!caregiverId) {
        setErrorMsg(labels.noCaregiver);
        setPhase('error');
        return;
      }

      const patientName =
        profile?.fullName ||
        profile?.displayName ||
        user.email ||
        'PULSE Patient';

      setPhase('processing');
      try {
        await processSosVoiceNote(blob, user.uid, caregiverId, patientName);
        setPhase('sent');
      } catch (err) {
        console.error('[SOSButton] pipeline failed', err);
        setErrorMsg(labels.errorPipeline);
        setPhase('error');
      }
    },
    [user, profile, labels]
  );

  const startRecording = useCallback(async () => {
    cancelledRef.current = false;
    setRecordedMs(0);
    setErrorMsg(null);
    audioChunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('[SOSButton] getUserMedia rejected', err);
      setErrorMsg(labels.errorMicDenied);
      setPhase('error');
      return;
    }
    mediaStreamRef.current = stream;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch (err) {
      console.warn('[SOSButton] MediaRecorder unsupported', err);
      stopMediaTracks();
      setErrorMsg(labels.errorPipeline);
      setPhase('error');
      return;
    }
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      clearRecordingTimers();
      stopMediaTracks();

      if (cancelledRef.current) {
        // Cancelled — discard everything; component returns to idle.
        audioChunksRef.current = [];
        return;
      }

      const blob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });
      audioChunksRef.current = [];
      void processCapturedAudio(blob);
    };

    recorder.start();
    recordingStartedAtRef.current = performance.now();
    setPhase('recording');

    recordingTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - recordingStartedAtRef.current;
      setRecordedMs(Math.min(elapsed, MAX_RECORDING_MS));
    }, 100);

    recordingMaxTimeoutRef.current = window.setTimeout(() => {
      const r = mediaRecorderRef.current;
      if (r && r.state === 'recording') {
        r.stop();
      }
    }, MAX_RECORDING_MS);
  }, [labels, stopMediaTracks, clearRecordingTimers, processCapturedAudio]);

  const stopAndSend = useCallback(() => {
    cancelledRef.current = false;
    const r = mediaRecorderRef.current;
    if (r && r.state === 'recording') {
      r.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    const r = mediaRecorderRef.current;
    if (r && r.state === 'recording') {
      r.stop();
    } else {
      clearRecordingTimers();
      stopMediaTracks();
    }
    audioChunksRef.current = [];
    setRecordedMs(0);
    setPhase('idle');
  }, [clearRecordingTimers, stopMediaTracks]);

  // Long-press progress tick. We hold the latest tick callback in a
  // ref so the rAF chain self-references safely without tripping the
  // "accessed before declared" hook lint or stale closures.
  const tickRef = useRef<((now: number) => void) | null>(null);
  const tick = useCallback(
    (now: number) => {
      const elapsed = now - startedAtRef.current;
      const pct = Math.min(1, elapsed / HOLD_MS);
      setPressProgress(pct);
      if (pct >= 1) {
        if (!triggeredRef.current) {
          triggeredRef.current = true;
          cancelLoop();
          void startRecording();
        }
        return;
      }
      rafRef.current = requestAnimationFrame((n) => tickRef.current?.(n));
    },
    [cancelLoop, startRecording]
  );
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const handlePressStart = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (phase !== 'idle') return;
      e.preventDefault();
      try {
        (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
      } catch {
        // Pointer capture is best-effort; older Safari throws on touch.
      }
      triggeredRef.current = false;
      startedAtRef.current = performance.now();
      setPhase('pressing');
      setPressProgress(0);
      cancelLoop();
      rafRef.current = requestAnimationFrame(tick);
    },
    [cancelLoop, tick, phase]
  );

  const handlePressEnd = useCallback(() => {
    if (triggeredRef.current) return;
    cancelLoop();
    if (phase === 'pressing') {
      setPhase('idle');
    }
    setPressProgress(0);
  }, [cancelLoop, phase]);

  // Reset triggered flag whenever we leave the active states
  useEffect(() => {
    if (phase === 'idle') {
      triggeredRef.current = false;
    }
  }, [phase]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      cancelLoop();
      clearRecordingTimers();
      stopMediaTracks();
    },
    [cancelLoop, clearRecordingTimers, stopMediaTracks]
  );

  // Hide for caregivers and for caregivers viewing a patient
  if (role !== 'patient' || isCaregiverViewing) return null;

  const ringDashOffset = RING_C * (1 - pressProgress);
  const recordingPct = Math.min(1, recordedMs / MAX_RECORDING_MS);

  const showOverlay =
    phase === 'recording' ||
    phase === 'processing' ||
    phase === 'sent' ||
    phase === 'error';

  return (
    <>
      {/* === Floating SOS FAB === */}
      <div
        className="fixed right-6 bottom-24 lg:bottom-6 z-30 flex flex-col items-center select-none"
        style={{ touchAction: 'none' }}
      >
        <div
          className="relative"
          style={{ width: RING_SIZE, height: RING_SIZE }}
        >
          {phase === 'idle' && (
            <>
              <span className="absolute inset-0 rounded-full bg-danger/25 animate-ping pointer-events-none" />
              <span className="absolute inset-1 rounded-full bg-danger/20 animate-pulse pointer-events-none" />
            </>
          )}

          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            className="absolute inset-0 -rotate-90 pointer-events-none"
            aria-hidden="true"
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="transparent"
              strokeWidth={RING_STROKE}
              className="stroke-danger-light"
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="transparent"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={ringDashOffset}
              stroke="#FFFFFF"
              className="transition-[stroke-dashoffset] duration-100 ease-linear"
            />
          </svg>

          <button
            type="button"
            aria-label={labels.srLabel}
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerLeave={handlePressEnd}
            onPointerCancel={handlePressEnd}
            onContextMenu={(e) => e.preventDefault()}
            disabled={phase !== 'idle' && phase !== 'pressing'}
            style={{ minHeight: 80, minWidth: 80 }}
            className={`absolute inset-2 rounded-full flex items-center justify-center text-white shadow-lifted tactile-btn transition-colors ${
              phase === 'pressing'
                ? 'bg-danger-dark scale-95'
                : 'bg-danger hover:bg-danger-dark'
            } ${
              phase !== 'idle' && phase !== 'pressing'
                ? 'opacity-90 cursor-wait'
                : 'cursor-pointer'
            }`}
          >
            <ShieldAlert size={32} strokeWidth={2.4} />
          </button>
        </div>

        {phase === 'idle' && (
          <span className="mt-2 px-3 py-1 rounded-pill bg-danger text-white text-xs font-medium uppercase tracking-wider shadow-soft">
            SOS · {labels.helper}
          </span>
        )}
      </div>

      {showOverlay && (
        <div
          className="fixed inset-0 z-50 bg-navy-50/55 backdrop-blur-md flex flex-col items-center justify-center px-6 py-10 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sos-modal-title"
        >
          {/* === Recording phase === */}
          {phase === 'recording' && (
            <>
              <div className="relative w-44 h-44 flex items-center justify-center mb-8">
                <span className="absolute inset-0 rounded-full bg-danger/25 animate-ping" />
                <span className="absolute inset-4 rounded-full bg-danger/35 animate-pulse" />
                <div className="relative w-32 h-32 rounded-full bg-danger flex flex-col items-center justify-center shadow-lifted text-white">
                  <span className="font-mono text-3xl font-medium">
                    {formatSeconds(MAX_RECORDING_MS - recordedMs)}
                  </span>
                  <span className="text-xs uppercase tracking-wider mt-1 opacity-90">
                    REC
                  </span>
                </div>
              </div>

              {/* Waveform animation — pure CSS, 7 bars bouncing */}
              <div
                className="flex items-end gap-1 h-12 mb-6"
                aria-hidden="true"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <span
                    key={i}
                    className="w-2 bg-white rounded-full waveform-bar"
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>

              <h2
                id="sos-modal-title"
                className="text-2xl sm:text-3xl font-medium text-white text-center max-w-md leading-tight"
              >
                {labels.recordingTitle}
              </h2>
              {/* Bilingual instructions: native string + an English
                  fallback so both the patient and any nearby helper
                  can act on the prompt. */}
              {langKey !== 'en' && (
                <p className="mt-3 text-base text-white/85 text-center max-w-md">
                  {PHRASES.en.recordingTitle}. {PHRASES.en.recordingHint}
                </p>
              )}
              <p className="mt-2 text-base text-white text-center max-w-md">
                {labels.recordingHint}
              </p>

              <div className="w-full max-w-md mt-6 bg-white/15 rounded-pill h-2 overflow-hidden">
                <div
                  className="h-full bg-white rounded-pill transition-[width] duration-100 ease-linear"
                  style={{ width: `${recordingPct * 100}%` }}
                />
              </div>

              <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={stopAndSend}
                  aria-label={labels.stopAndSend}
                  className="inline-flex items-center gap-2 bg-white hover:bg-navy-50 text-danger-dark font-medium py-3 px-6 rounded-card shadow-soft tactile-btn"
                  style={{ minHeight: 56 }}
                >
                  <Send size={18} strokeWidth={2.5} />
                  <span>{labels.stopAndSend}</span>
                </button>
                <button
                  onClick={cancelRecording}
                  aria-label={labels.cancel}
                  className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-850 text-navy-50 font-medium py-3 px-6 rounded-card border border-navy-800 hover:border-accent shadow-soft tactile-btn"
                  style={{ minHeight: 56 }}
                >
                  <Square size={18} />
                  <span>{labels.cancel}</span>
                </button>
              </div>
            </>
          )}

          {/* === Processing phase === */}
          {phase === 'processing' && (
            <>
              <div className="relative w-40 h-40 flex items-center justify-center mb-8">
                <span className="absolute inset-0 rounded-full bg-danger/25 animate-ping" />
                <span className="absolute inset-6 rounded-full bg-danger/35 animate-pulse" />
                <div className="relative w-28 h-28 rounded-full bg-danger flex items-center justify-center shadow-lifted text-white">
                  <Loader2 size={44} className="animate-spin" />
                </div>
              </div>
              <h2
                id="sos-modal-title"
                className="text-2xl sm:text-3xl font-medium text-white text-center max-w-md leading-tight"
              >
                {labels.processing}
              </h2>
              <p className="mt-4 text-base text-white/90 text-center max-w-md">
                {labels.processingHint}
              </p>
            </>
          )}

          {/* === Sent phase === */}
          {phase === 'sent' && (
            <>
              <div className="relative w-40 h-40 flex items-center justify-center mb-8">
                <span className="absolute inset-0 rounded-full bg-success/25 animate-ping" />
                <span className="absolute inset-6 rounded-full bg-success/35 animate-pulse" />
                <div className="relative w-28 h-28 rounded-full bg-success flex items-center justify-center shadow-lifted text-white">
                  <CheckCircle2 size={48} strokeWidth={2.4} />
                </div>
              </div>
              <h2
                id="sos-modal-title"
                className="text-2xl sm:text-3xl font-medium text-white text-center max-w-md leading-tight"
              >
                {labels.sent}
              </h2>
              <button
                onClick={() => {
                  setPhase('idle');
                  setRecordedMs(0);
                }}
                className="mt-8 inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-850 text-navy-50 font-medium py-3 px-6 rounded-card border border-navy-800 hover:border-accent shadow-soft tactile-btn"
                style={{ minHeight: 56 }}
              >
                <X size={18} />
                <span>{labels.dismiss}</span>
              </button>
            </>
          )}

          {/* === Error phase === */}
          {phase === 'error' && (
            <>
              <div className="relative w-40 h-40 flex items-center justify-center mb-8">
                <span className="absolute inset-0 rounded-full bg-danger/25 animate-ping" />
                <div className="relative w-28 h-28 rounded-full bg-danger flex items-center justify-center shadow-lifted text-white">
                  <AlertTriangle size={44} />
                </div>
              </div>
              <h2
                id="sos-modal-title"
                className="text-2xl sm:text-3xl font-medium text-white text-center max-w-md leading-tight"
              >
                {labels.errorTitle}
              </h2>
              {errorMsg && (
                <p className="mt-4 text-base text-white/90 text-center max-w-md">
                  {errorMsg}
                </p>
              )}
              <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => {
                    setErrorMsg(null);
                    void startRecording();
                  }}
                  className="inline-flex items-center gap-2 bg-danger hover:bg-danger-dark text-white font-medium py-3 px-6 rounded-card shadow-soft tactile-btn"
                  style={{ minHeight: 56 }}
                >
                  {labels.retry}
                </button>
                <button
                  onClick={() => {
                    setPhase('idle');
                    setErrorMsg(null);
                    setRecordedMs(0);
                  }}
                  className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-850 text-navy-50 font-medium py-3 px-6 rounded-card border border-navy-800 hover:border-accent shadow-soft tactile-btn"
                  style={{ minHeight: 56 }}
                >
                  <X size={18} />
                  <span>{labels.dismiss}</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default SOSButton;
