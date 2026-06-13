import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

/* =====================================================================
 * AccessibilityContext
 * ---------------------------------------------------------------------
 * Centralises every preference that affects how PULSE feels for elderly
 * and disabled users: theme (light/dark), text size, high-contrast mode,
 * reduced motion, voice feedback, sound volume.
 *
 * The hook exposes simple setters. Real application is done by writing
 * data-* attributes on <html>, which CSS variables in index.css listen
 * to. That means colour/font changes flow instantly with no React
 * re-renders required.
 * ===================================================================== */

export type ThemeMode = 'light' | 'dark';
export type FontSizePreset = 'small' | 'normal' | 'large' | 'extra-large';

export interface AccessibilitySettings {
  theme: ThemeMode;
  fontSize: FontSizePreset;
  highContrast: boolean;
  reduceMotion: boolean;
  voiceFeedback: boolean;
  soundVolume: number; // 0-100
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  theme: 'light',
  fontSize: 'large',     // elder-friendly default (≈20px body text)
  highContrast: false,
  reduceMotion: false,
  voiceFeedback: true,
  soundVolume: 80,
};

const STORAGE_KEY = 'pulse_a11y_settings_v1';

interface AccessibilityContextValue extends AccessibilitySettings {
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  setFontSize: (s: FontSizePreset) => void;
  setHighContrast: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
  setVoiceFeedback: (v: boolean) => void;
  setSoundVolume: (n: number) => void;
  resetDefaults: () => void;
  exportSettings: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

function readInitial(): AccessibilitySettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  // Honour the OS-level reduce-motion preference on first run.
  const osReduceMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { ...DEFAULT_SETTINGS, reduceMotion: osReduceMotion };
}

function applyToDocument(s: AccessibilitySettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.fontSize = s.fontSize;
  root.dataset.highContrast = s.highContrast ? 'true' : 'false';
  root.dataset.reduceMotion = s.reduceMotion ? 'true' : 'false';
  // Match the OS theme-color meta so mobile status bars stay in sync.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const value = s.theme === 'dark'
      ? (s.highContrast ? '#000000' : '#0A1428')
      : (s.highContrast ? '#FFFFFF' : '#F4F7FF');
    meta.setAttribute('content', value);
  }
}

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AccessibilitySettings>(readInitial);

  useEffect(() => {
    applyToDocument(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore quota errors */
    }
  }, [settings]);

  const setTheme = useCallback((theme: ThemeMode) =>
    setSettings(prev => ({ ...prev, theme })), []);

  const toggleTheme = useCallback(() =>
    setSettings(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' })), []);

  const setFontSize = useCallback((fontSize: FontSizePreset) =>
    setSettings(prev => ({ ...prev, fontSize })), []);

  const setHighContrast = useCallback((highContrast: boolean) =>
    setSettings(prev => ({ ...prev, highContrast })), []);

  const setReduceMotion = useCallback((reduceMotion: boolean) =>
    setSettings(prev => ({ ...prev, reduceMotion })), []);

  const setVoiceFeedback = useCallback((voiceFeedback: boolean) =>
    setSettings(prev => ({ ...prev, voiceFeedback })), []);

  const setSoundVolume = useCallback((soundVolume: number) =>
    setSettings(prev => ({ ...prev, soundVolume: Math.max(0, Math.min(100, Math.round(soundVolume))) })), []);

  const resetDefaults = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const exportSettings = useCallback(() => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PULSE_settings_backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [settings]);

  const value: AccessibilityContextValue = {
    ...settings,
    setTheme,
    toggleTheme,
    setFontSize,
    setHighContrast,
    setReduceMotion,
    setVoiceFeedback,
    setSoundVolume,
    resetDefaults,
    exportSettings,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = (): AccessibilityContextValue => {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return ctx;
};
