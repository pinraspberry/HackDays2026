import React, { useEffect, useRef, useState } from 'react';
import {
  Pill,
  AlertTriangle,
  ClipboardList,
  Clock,
  Volume2,
  Loader2,
  X,
  RefreshCw,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useActivePatient } from '../context/RoleContext';
import { SarvamService } from '../services/sarvamService';
import {
  flattenMedicineInfo,
  loadMedicineInfo,
  type MedicineInfo,
} from '../services/medicineInfoService';

interface MedicineInfoPanelProps {
  /** When non-null the panel slides up; null fully unmounts it. */
  medicineName: string | null;
  onClose: () => void;
}

const ANIM_MS = 280;

/**
 * Slide-up info panel for a single medicine. Hits the cached Sarvam
 * LLM response, renders four iconed sections, and offers a Speak
 * Aloud button that pipes the full text through Sarvam TTS.
 */
export const MedicineInfoPanel: React.FC<MedicineInfoPanelProps> = ({
  medicineName,
  onClose,
}) => {
  const { language } = useSettings();
  const { patientId } = useActivePatient();

  const [info, setInfo] = useState<MedicineInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Animation: mounted vs visible. We mount when medicineName is set,
  // then in the next paint flip visible=true so the CSS transition
  // animates the slide-up. On close we flip visible=false and unmount
  // after ANIM_MS.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (medicineName) {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setMounted(true);
      // Next frame so the transition has a clean start state.
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    } else if (mounted) {
      setVisible(false);
      closeTimerRef.current = window.setTimeout(() => {
        setMounted(false);
        setInfo(null);
        setError(null);
      }, ANIM_MS);
      return () => {
        if (closeTimerRef.current) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicineName]);

  // Fetch info each time medicineName changes (and on language change
  // while open).
  useEffect(() => {
    if (!medicineName || !patientId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    loadMedicineInfo(patientId, medicineName, language)
      .then((res) => {
        if (cancelled) return;
        setInfo(res.info);
        setCached(res.cached);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[MedicineInfoPanel] load failed', err);
        setError(err?.message || 'Could not load information.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [medicineName, patientId, language]);

  // Esc key closes
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mounted, onClose]);

  const labels = (() => {
    if (language === 'hi') {
      return {
        title: 'दवा की जानकारी',
        subtitle: 'AI-संचालित सरल भाषा गाइड',
        purpose: 'उपयोग',
        sideEffects: 'दुष्प्रभाव',
        instructions: 'निर्देश',
        missedDose: 'खुराक भूल गए?',
        speak: 'सुनें',
        stopSpeak: 'रोकें',
        loading: 'दवा की जानकारी तैयार की जा रही है…',
        refresh: 'फिर बनाएँ',
        cachedTag: 'कैश से',
        freshTag: 'अभी बनाया',
        disclaimer:
          'यह AI द्वारा बनाई गई जानकारी है। चिकित्सकीय सलाह के लिए अपने डॉक्टर से ज़रूर मिलें।',
        close: 'बंद करें',
        error: 'जानकारी लोड नहीं हो सकी।',
      };
    }
    if (language === 'ta') {
      return {
        title: 'மருந்து தகவல்',
        subtitle: 'AI-உருவாக்கிய எளிய மொழி வழிகாட்டி',
        purpose: 'பயன்பாடு',
        sideEffects: 'பக்க விளைவுகள்',
        instructions: 'வழிமுறைகள்',
        missedDose: 'மருந்தை தவறவிட்டால்?',
        speak: 'கேள்',
        stopSpeak: 'நிறுத்து',
        loading: 'மருந்து தகவல் தயாராகிறது…',
        refresh: 'மீண்டும் உருவாக்கு',
        cachedTag: 'கேச்',
        freshTag: 'புதியது',
        disclaimer:
          'இது AI உருவாக்கிய தகவல். மருத்துவ ஆலோசனைக்கு உங்கள் மருத்துவரை அணுகவும்.',
        close: 'மூடு',
        error: 'தகவலை ஏற்ற முடியவில்லை.',
      };
    }
    return {
      title: 'Medicine Info',
      subtitle: 'AI-generated plain-language guide',
      purpose: 'Purpose',
      sideEffects: 'Side Effects',
      instructions: 'Instructions',
      missedDose: 'Missed Dose',
      speak: 'Speak Aloud',
      stopSpeak: 'Stop',
      loading: 'Preparing medicine information…',
      refresh: 'Re-generate',
      cachedTag: 'Cached',
      freshTag: 'Fresh',
      disclaimer:
        'This is AI-generated information. Consult your doctor for medical advice.',
      close: 'Close',
      error: 'Could not load information.',
    };
  })();

  const handleSpeak = async () => {
    if (!info) return;
    if (speaking) return;
    const text = flattenMedicineInfo(info);
    if (!text.trim()) return;
    setSpeaking(true);
    try {
      await SarvamService.textToSpeech(text, language);
    } catch (err) {
      console.warn('[MedicineInfoPanel] TTS failed', err);
    } finally {
      setSpeaking(false);
    }
  };

  const handleRefresh = async () => {
    if (!medicineName || !patientId) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await loadMedicineInfo(patientId, medicineName, language, {
        forceRefresh: true,
      });
      setInfo(res.info);
      setCached(res.cached);
    } catch (err: any) {
      setError(err?.message || 'Re-generate failed.');
    } finally {
      setRefreshing(false);
    }
  };

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={labels.close}
        onClick={onClose}
        className={`absolute inset-0 bg-navy-50/40 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Slide-up panel */}
      <div
        className={`relative w-full sm:max-w-2xl mx-auto bg-navy-900 border-t border-x border-navy-800 rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] transition-transform duration-300 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ willChange: 'transform' }}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-2 flex justify-center cursor-grab active:cursor-grabbing select-none">
          <span className="block w-12 h-1.5 rounded-full bg-navy-750" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 border-b border-navy-800 flex items-start gap-3">
          <div className="w-11 h-11 rounded-card bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
            <Pill size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-medium text-navy-50 truncate">
                {medicineName}
              </h2>
              {info && !loading && (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                    cached
                      ? 'bg-navy-950 border-navy-800 text-navy-700'
                      : 'bg-accent/10 border-accent/30 text-accent'
                  }`}
                >
                  <Sparkles size={9} />
                  {cached ? labels.cachedTag : labels.freshTag}
                </span>
              )}
            </div>
            <p className="text-xs text-navy-700 mt-0.5 truncate">
              {labels.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="p-2 text-navy-100 hover:text-navy-50 bg-navy-950 border border-navy-800 rounded-card tactile-btn disabled:opacity-50"
              aria-label={labels.refresh}
              style={{ minHeight: 40, minWidth: 40 }}
            >
              {refreshing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-navy-100 hover:text-navy-50 bg-navy-950 border border-navy-800 rounded-card tactile-btn"
              aria-label={labels.close}
              style={{ minHeight: 40, minWidth: 40 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto thin-scroll px-5 py-4 space-y-3">
          {loading ? (
            <SkeletonBody loadingLabel={labels.loading} />
          ) : error ? (
            <div className="card-navy bg-danger-light border-danger/30 flex items-start gap-2">
              <AlertTriangle size={18} className="text-danger-dark mt-0.5 shrink-0" />
              <div className="text-sm text-danger-dark font-medium">{labels.error}</div>
            </div>
          ) : info ? (
            <>
              <InfoSection
                icon={<Pill size={16} />}
                emoji="💊"
                title={labels.purpose}
                tone="accent"
                body={info.purpose}
              />
              <InfoSection
                icon={<AlertTriangle size={16} />}
                emoji="⚠️"
                title={labels.sideEffects}
                tone="amber"
                body={info.sideEffects}
              />
              <InfoSection
                icon={<ClipboardList size={16} />}
                emoji="📋"
                title={labels.instructions}
                tone="emerald"
                body={info.instructions}
              />
              <InfoSection
                icon={<Clock size={16} />}
                emoji="⏰"
                title={labels.missedDose}
                tone="rose"
                body={info.missedDose}
              />
            </>
          ) : null}
        </div>

        {/* Footer — speak aloud + disclaimer */}
        <div className="border-t border-navy-800 px-5 py-3 space-y-3 bg-navy-900">
          <button
            onClick={handleSpeak}
            disabled={!info || loading || speaking}
            className="w-full inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium rounded-card shadow-soft tactile-btn disabled:opacity-50"
            style={{ minHeight: 52 }}
          >
            {speaking ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span className="text-sm">{labels.stopSpeak}</span>
              </>
            ) : (
              <>
                <Volume2 size={16} />
                <span className="text-sm">{labels.speak}</span>
              </>
            )}
          </button>
          <div className="flex items-start gap-2 text-xs text-navy-700 leading-relaxed">
            <ShieldAlert size={12} className="text-accent mt-0.5 shrink-0" />
            <span>{labels.disclaimer}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ===== Helpers ===== */

const toneStyles: Record<string, { bg: string; border: string; text: string; ring: string }> = {
  accent: {
    bg: 'bg-accent/10',
    border: 'border-accent/30',
    text: 'text-accent',
    ring: 'bg-accent/15',
  },
  amber: {
    bg: 'bg-warning-light',
    border: 'border-warning/30',
    text: 'text-warning-dark',
    ring: 'bg-warning/15',
  },
  emerald: {
    bg: 'bg-success-light',
    border: 'border-success/30',
    text: 'text-success-dark',
    ring: 'bg-success/15',
  },
  rose: {
    bg: 'bg-danger-light',
    border: 'border-danger/30',
    text: 'text-danger-dark',
    ring: 'bg-danger/15',
  },
};

const InfoSection: React.FC<{
  icon: React.ReactNode;
  emoji: string;
  title: string;
  body: string;
  tone: keyof typeof toneStyles;
}> = ({ icon, emoji, title, body, tone }) => {
  const t = toneStyles[tone];
  return (
    <section className={`rounded-card border ${t.border} ${t.bg} p-3 sm:p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`w-8 h-8 rounded-card ${t.ring} ${t.text} flex items-center justify-center border ${t.border} shrink-0`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <h3 className={`text-xs sm:text-xs font-medium uppercase tracking-widest ${t.text}`}>
          <span className="mr-1.5" aria-hidden="true">
            {emoji}
          </span>
          {title}
        </h3>
      </div>
      <p className="text-sm text-navy-50 leading-relaxed whitespace-pre-wrap">{body}</p>
    </section>
  );
};

const SkeletonBody: React.FC<{ loadingLabel: string }> = ({ loadingLabel }) => (
  <div className="space-y-3" aria-busy="true">
    <div className="flex items-center gap-2 text-navy-700">
      <Loader2 size={14} className="animate-spin text-accent" />
      <span className="text-xs font-medium">{loadingLabel}</span>
    </div>
    {[0, 1, 2, 3].map((i) => (
      <div
        key={i}
        className="card-navy animate-pulse space-y-2"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-card bg-navy-800" />
          <div className="h-3 w-32 bg-navy-800 rounded" />
        </div>
        <div className="h-2.5 w-full bg-navy-800 rounded" />
        <div className="h-2.5 w-4/5 bg-navy-800 rounded" />
      </div>
    ))}
  </div>
);

export default MedicineInfoPanel;
