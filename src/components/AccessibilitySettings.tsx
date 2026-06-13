import React, { useState } from 'react';
import {
  X,
  Sun,
  Moon,
  Type,
  Contrast,
  Volume2,
  VolumeX,
  Wind,
  RotateCcw,
  Download,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Languages,
  Pill,
  CheckCircle2,
} from 'lucide-react';
import {
  useAccessibility,
  type FontSizePreset,
  type ThemeMode,
} from '../context/AccessibilityContext';
import { useSettings } from '../context/SettingsContext';
import type { LanguageCode } from '../context/SettingsContext';
import { SarvamService } from '../services/sarvamService';

/* =====================================================================
 * AccessibilitySettings
 * ---------------------------------------------------------------------
 * The right-hand drawer surfaced from the gear icon in the top bar.
 * Houses every preference an elderly user might need to tweak:
 *   • Theme (light / dark)
 *   • Text size (small / normal / large / extra-large)
 *   • High-contrast toggle
 *   • Reduce motion
 *   • Voice feedback
 *   • Sound volume
 *   • Language
 *   • Live preview of a medicine card
 *   • Reset & export
 *   • Developer API keys (collapsed by default to reduce cognitive load)
 * ===================================================================== */

interface Props {
  open: boolean;
  onClose: () => void;
}

const FONT_PRESETS: { id: FontSizePreset; label: string; sub: string }[] = [
  { id: 'small',       label: 'Small',       sub: 'A' },
  { id: 'normal',      label: 'Normal',      sub: 'A' },
  { id: 'large',       label: 'Large',       sub: 'A' },
  { id: 'extra-large', label: 'Extra Large', sub: 'A' },
];

const LANGUAGE_OPTIONS: { code: LanguageCode; native: string; latin: string }[] = [
  { code: 'hi', native: 'हिंदी',     latin: 'Hindi' },
  { code: 'en', native: 'English',  latin: 'English' },
  { code: 'ta', native: 'தமிழ்',    latin: 'Tamil' },
  { code: 'te', native: 'తెలుగు',   latin: 'Telugu' },
  { code: 'bn', native: 'বাংলা',     latin: 'Bengali' },
  { code: 'mr', native: 'मराठी',     latin: 'Marathi' },
  { code: 'gu', native: 'ગુજરાતી',   latin: 'Gujarati' },
  { code: 'kn', native: 'ಕನ್ನಡ',     latin: 'Kannada' },
  { code: 'ml', native: 'മലയാളം',  latin: 'Malayalam' },
];

export const AccessibilitySettings: React.FC<Props> = ({ open, onClose }) => {
  const {
    theme, fontSize, highContrast, reduceMotion, voiceFeedback, soundVolume,
    setTheme, setFontSize, setHighContrast, setReduceMotion, setVoiceFeedback,
    setSoundVolume, resetDefaults, exportSettings,
  } = useAccessibility();

  const {
    language, setLanguage,
    sarvamKey, setSarvamKey,
    firebaseConfig, setFirebaseConfig,
    isDemo, setIsDemo,
  } = useSettings();

  const [confirmReset, setConfirmReset] = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [tempSarvam, setTempSarvam] = useState(sarvamKey);
  const [tempFirebase, setTempFirebase] = useState(firebaseConfig);

  // ESC closes the drawer.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const playTestSound = () => {
    try {
      const Audio = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Audio) return;
      const ctx = new Audio();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = 660;
      g.gain.value = (soundVolume / 100) * 0.18;
      o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 240);
    } catch { /* noop */ }
  };

  const handleSaveDevKeys = () => {
    setSarvamKey(tempSarvam);
    setFirebaseConfig(tempFirebase);
    SarvamService.setApiKey(tempSarvam);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-navy-50/40 backdrop-blur-sm flex justify-end animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Accessibility settings"
      onClick={onClose}
    >
      <div
        className="w-full sm:w-[520px] h-full bg-navy-900 border-l border-navy-800 flex flex-col shadow-lifted animate-slide-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-navy-900 border-b border-navy-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-medium text-navy-50">Settings</h2>
            <p className="text-sm font-medium text-navy-700 mt-1">
              Make PULSE work the way you do.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-navy-50 hover:text-accent bg-navy-850 hover:bg-accent/10 rounded-card border border-navy-800 hover:border-accent tactile-btn flex items-center justify-center min-tap-lg"
            aria-label="Close settings"
          >
            <X size={22} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto thin-scroll px-6 py-6 space-y-7">

          {/* ===== Theme toggle ===== */}
          <Section title="Theme" subtitle="Dark mode is easier on the eyes at night; light mode is sharper in daylight.">
            <div
              className="grid grid-cols-2 gap-3 bg-navy-950 border border-navy-800 rounded-card p-2"
              role="radiogroup"
              aria-label="App theme"
            >
              <ThemeButton
                active={theme === 'light'}
                onClick={() => setTheme('light')}
                icon={<Sun size={22} />}
                label="Light"
              />
              <ThemeButton
                active={theme === 'dark'}
                onClick={() => setTheme('dark')}
                icon={<Moon size={22} />}
                label="Dark"
              />
            </div>
          </Section>

          {/* ===== Text size ===== */}
          <Section
            title="Text Size"
            subtitle="Pick the size that's most comfortable for you to read."
            icon={<Type size={20} className="text-accent" />}
          >
            <div
              className="grid grid-cols-2 md:grid-cols-4 gap-3"
              role="radiogroup"
              aria-label="Text size"
            >
              {FONT_PRESETS.map(({ id, label }) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={fontSize === id}
                  onClick={() => setFontSize(id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-card border tactile-btn px-3 py-3 ${
                    fontSize === id
                      ? 'bg-accent border-accent text-white shadow-soft'
                      : 'bg-navy-950 border-navy-800 text-navy-50 hover:border-accent'
                  }`}
                  style={{ minHeight: 64 }}
                >
                  <span
                    className="font-medium leading-none"
                    style={{
                      fontSize:
                        id === 'small' ? 14
                        : id === 'normal' ? 18
                        : id === 'large' ? 22
                        : 28,
                    }}
                  >
                    A
                  </span>
                  <span className="text-xs font-medium tracking-wide">{label}</span>
                </button>
              ))}
            </div>

            {/* Live preview tile */}
            <div className="mt-4 bg-navy-950 border border-navy-800 rounded-card p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-navy-700 mb-2">
                Live preview
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-card bg-accent/10 border border-accent/30 flex items-center justify-center text-accent">
                  <Pill size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-medium text-navy-50">Paracetamol 500 mg</div>
                  <div className="text-sm text-navy-700 mt-0.5">
                    {language === 'hi' ? 'खाने के बाद, दिन में 2 बार' : '1 tablet, twice daily after meals'}
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ===== High contrast ===== */}
          <Section
            title="High Contrast"
            subtitle="Boosts borders and colour separation. Useful for low-vision or in bright sunlight."
            icon={<Contrast size={20} className="text-accent" />}
          >
            <ToggleSwitch
              checked={highContrast}
              onChange={setHighContrast}
              label={highContrast ? 'On' : 'Off'}
              ariaLabel="High contrast mode"
            />
            {highContrast && (
              <ul className="mt-3 space-y-1.5 text-sm font-medium text-navy-100 leading-relaxed">
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-success-dark mt-1 shrink-0" /> Maximum text contrast</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-success-dark mt-1 shrink-0" /> Thicker borders on cards and buttons</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-success-dark mt-1 shrink-0" /> Brighter, more saturated accent colours</li>
              </ul>
            )}
          </Section>

          {/* ===== Audio & motion ===== */}
          <Section
            title="Audio & Motion"
            subtitle="Controls how PULSE speaks, moves, and reacts."
            icon={<Volume2 size={20} className="text-accent" />}
          >
            <div className="space-y-4">
              <RowToggle
                title="Voice feedback"
                description='PULSE will say "medicine added" out loud after each action.'
                checked={voiceFeedback}
                onChange={setVoiceFeedback}
              />
              <RowToggle
                title="Reduce motion"
                description="Disables pulsing, sliding and fade animations."
                checked={reduceMotion}
                onChange={setReduceMotion}
                icon={<Wind size={18} className="text-navy-700" />}
              />
              <div className="bg-navy-950 border border-navy-800 rounded-card p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="text-base font-medium text-navy-50">Sound volume</div>
                    <div className="text-sm text-navy-700 mt-0.5">Adjust how loud audio confirmations play.</div>
                  </div>
                  <span className="shrink-0 text-base font-medium text-accent" aria-live="polite">
                    {soundVolume}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseInt(e.target.value, 10))}
                  aria-label="Sound volume"
                  className="w-full h-3 rounded-pill bg-navy-800 accent-[rgb(var(--c-accent))] cursor-pointer"
                />
                <div className="flex items-center justify-between mt-3 gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-navy-700">
                    <VolumeX size={16} /> 0%
                  </div>
                  <button
                    onClick={playTestSound}
                    className="inline-flex items-center gap-2 bg-navy-850 hover:bg-accent/10 border border-navy-800 hover:border-accent text-navy-50 hover:text-accent-dark font-medium text-sm rounded-card px-4 tactile-btn"
                    style={{ minHeight: 44 }}
                  >
                    <Volume2 size={16} />
                    <span>Test sound</span>
                  </button>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-navy-700">
                    100% <Volume2 size={16} />
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ===== Language ===== */}
          <Section
            title="Language"
            subtitle="Changes apply instantly across the whole app."
            icon={<Languages size={20} className="text-accent" />}
          >
            <div
              className="grid grid-cols-2 md:grid-cols-3 gap-2"
              role="radiogroup"
              aria-label="Language"
            >
              {LANGUAGE_OPTIONS.map(({ code, native, latin }) => (
                <button
                  key={code}
                  role="radio"
                  aria-checked={language === code}
                  onClick={() => setLanguage(code)}
                  className={`flex flex-col items-start gap-0.5 rounded-card border tactile-btn px-4 py-3 text-left ${
                    language === code
                      ? 'bg-accent border-accent text-white shadow-soft'
                      : 'bg-navy-950 border-navy-800 text-navy-50 hover:border-accent'
                  }`}
                  style={{ minHeight: 56 }}
                >
                  <span className="text-base font-medium leading-tight">{native}</span>
                  <span className={`text-xs font-medium ${language === code ? 'text-white/85' : 'text-navy-700'}`}>
                    {latin}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {/* ===== Developer / API keys ===== */}
          <div className="bg-navy-950 border border-navy-800 rounded-card overflow-hidden">
            <button
              onClick={() => setShowDev(v => !v)}
              aria-expanded={showDev}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left tactile-btn hover:bg-navy-850"
              style={{ minHeight: 56 }}
            >
              <span className="flex items-center gap-2 text-base font-medium text-navy-50">
                <ShieldAlert size={18} className="text-warning-dark" />
                Developer settings (API keys)
              </span>
              {showDev ? <ChevronUp size={18} className="text-navy-700" /> : <ChevronDown size={18} className="text-navy-700" />}
            </button>

            {showDev && (
              <div className="p-4 border-t border-navy-800 space-y-4 animate-fade-in">
                <div className="bg-warning-light border border-warning/30 rounded-card p-3 flex items-start gap-2">
                  <ShieldAlert size={18} className="text-warning-dark mt-0.5 shrink-0" />
                  <div className="text-sm font-medium text-warning-dark leading-relaxed">
                    Demo mode keeps PULSE working without external services.
                    <button
                      onClick={() => setIsDemo(!isDemo)}
                      className={`mt-2 block py-2 px-3 rounded-card text-sm font-medium border tactile-btn ${
                        isDemo
                          ? 'bg-accent border-accent text-white'
                          : 'border-warning/40 text-warning-dark bg-white hover:bg-warning-light'
                      }`}
                      style={{ minHeight: 44 }}
                    >
                      {isDemo ? 'Switch to Real API mode' : 'Switch to Offline Demo mode'}
                    </button>
                  </div>
                </div>

                <label className="block">
                  <span className="block text-sm font-medium text-navy-50 mb-2">Sarvam AI API key</span>
                  <input
                    type="password"
                    value={tempSarvam}
                    onChange={(e) => setTempSarvam(e.target.value)}
                    placeholder="sk_live_..."
                    className="w-full bg-navy-900 border border-navy-800 rounded-card px-4 text-sm text-navy-50 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                    style={{ minHeight: 48 }}
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-navy-50 mb-2">Firebase project config (JSON)</span>
                  <textarea
                    value={tempFirebase}
                    onChange={(e) => setTempFirebase(e.target.value)}
                    rows={5}
                    placeholder='{ "apiKey": "...", "projectId": "..." }'
                    className="w-full bg-navy-900 border border-navy-800 rounded-card py-3 px-4 text-sm text-navy-50 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 font-mono transition-all"
                  />
                </label>
                <button
                  onClick={handleSaveDevKeys}
                  className="w-full bg-accent hover:bg-accent-dark text-white font-medium rounded-card shadow-soft tactile-btn"
                  style={{ minHeight: 48 }}
                >
                  Save developer keys
                </button>
              </div>
            )}
          </div>

          {/* ===== Reset & export ===== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => {
                if (confirmReset) {
                  resetDefaults();
                  setConfirmReset(false);
                } else {
                  setConfirmReset(true);
                }
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-card border font-medium tactile-btn ${
                confirmReset
                  ? 'bg-danger border-danger text-white'
                  : 'bg-navy-950 border-navy-800 text-navy-50 hover:border-accent'
              }`}
              style={{ minHeight: 56 }}
            >
              <RotateCcw size={18} />
              <span>{confirmReset ? 'Tap again to confirm' : 'Reset to defaults'}</span>
            </button>
            <button
              onClick={exportSettings}
              className="inline-flex items-center justify-center gap-2 bg-navy-950 border border-navy-800 hover:border-accent text-navy-50 font-medium rounded-card tactile-btn"
              style={{ minHeight: 56 }}
            >
              <Download size={18} />
              <span>Export settings</span>
            </button>
          </div>

          <p className="text-xs text-navy-700 pt-2 leading-relaxed">
            Your preferences are saved on this device and applied instantly. Press
            <kbd className="mx-1 px-2 py-0.5 bg-navy-850 border border-navy-800 rounded text-xs">Esc</kbd>
            any time to close this panel.
          </p>
        </div>
      </div>
    </div>
  );
};

/* ---------- helpers ---------- */

const Section: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, children }) => (
  <section aria-label={title}>
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <h3 className="text-lg font-medium text-navy-50">{title}</h3>
    </div>
    {subtitle && <p className="text-sm font-medium text-navy-700 mb-4 leading-relaxed">{subtitle}</p>}
    {children}
  </section>
);

const ThemeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: ThemeMode | string;
}> = ({ active, onClick, icon, label }) => (
  <button
    role="radio"
    aria-checked={active}
    onClick={onClick}
    className={`flex flex-col items-center justify-center gap-2 rounded-card border tactile-btn ${
      active
        ? 'bg-accent border-accent text-white shadow-soft'
        : 'bg-navy-950 border-navy-800 text-navy-50 hover:border-accent'
    }`}
    style={{ minHeight: 72 }}
  >
    {icon}
    <span className="text-sm font-medium capitalize">{label}</span>
  </button>
);

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  ariaLabel?: string;
}> = ({ checked, onChange, label, ariaLabel }) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex items-center w-[120px] rounded-pill border tactile-btn ${
      checked
        ? 'bg-accent border-accent'
        : 'bg-navy-850 border-navy-800'
    }`}
    style={{ height: 56 }}
  >
    <span
      className={`absolute top-1 left-1 w-12 h-12 rounded-full bg-white shadow-soft transition-transform duration-200 flex items-center justify-center font-medium text-sm ${
        checked ? 'translate-x-[60px] text-accent' : 'translate-x-0 text-navy-50'
      }`}
    >
      {checked ? 'On' : 'Off'}
    </span>
    <span className={`absolute right-4 text-sm font-medium ${checked ? 'text-white' : 'opacity-0'}`}>
      {label}
    </span>
  </button>
);

const RowToggle: React.FC<{
  title: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}> = ({ title, description, checked, onChange, icon }) => (
  <div className="bg-navy-950 border border-navy-800 rounded-card p-4 flex items-center justify-between gap-4">
    <div className="min-w-0 flex items-start gap-2">
      {icon}
      <div className="min-w-0">
        <div className="text-base font-medium text-navy-50">{title}</div>
        {description && (
          <div className="text-sm text-navy-700 mt-0.5 leading-relaxed">{description}</div>
        )}
      </div>
    </div>
    <ToggleSwitch checked={checked} onChange={onChange} ariaLabel={title} />
  </div>
);

export default AccessibilitySettings;
