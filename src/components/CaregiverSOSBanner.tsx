import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useRole } from '../context/RoleContext';
import { useSettings } from '../context/SettingsContext';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Check,
  Loader2,
} from 'lucide-react';
import { acknowledgeSOSAlert } from '../services/sosService';

interface ActiveAlert {
  id: string;
  patientId: string;
  patientName: string;
  lat: number | null;
  lng: number | null;
  timestampMs: number | null;
}

// Firestore `in` query supports up to 30 values.
const IN_QUERY_LIMIT = 30;

const formatRelative = (ms: number | null, lang: string): string => {
  if (!ms) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) {
    return lang === 'hi'
      ? 'अभी अभी'
      : lang === 'ta'
      ? 'இப்போதே'
      : 'just now';
  }
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) {
    if (lang === 'hi') return `${mins} मिनट पहले`;
    if (lang === 'ta') return `${mins} நிமிடங்களுக்கு முன்`;
    return `${mins} min ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (lang === 'hi') return `${hrs} घंटे पहले`;
  if (lang === 'ta') return `${hrs} மணி நேரத்திற்கு முன்`;
  return `${hrs} hr ago`;
};

/**
 * Caregiver-only red banner that subscribes to all `triggered` SOS
 * alerts for the caregiver's linked patients and lets them
 * acknowledge each one. Rendered from `Layout.tsx` so it appears on
 * every tab.
 */
export const CaregiverSOSBanner: React.FC = () => {
  const { role, linkedPatientIds } = useRole();
  const { language } = useSettings();

  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Refresh "x mins ago" labels each minute.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const querablePatientIds = useMemo(() => {
    if (linkedPatientIds.length <= IN_QUERY_LIMIT) return linkedPatientIds;
    console.warn(
      `[CaregiverSOSBanner] linkedPatientIds (${linkedPatientIds.length}) exceeds Firestore in-query limit; truncating to ${IN_QUERY_LIMIT}.`
    );
    return linkedPatientIds.slice(0, IN_QUERY_LIMIT);
  }, [linkedPatientIds]);

  useEffect(() => {
    if (role !== 'caregiver' || querablePatientIds.length === 0) {
      setAlerts([]);
      return;
    }

    const q = query(
      collection(db, 'sosAlerts'),
      where('patientId', 'in', querablePatientIds),
      where('status', '==', 'triggered')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: ActiveAlert[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          const tsMs =
            data?.timestamp?.toMillis?.() ??
            (typeof data?.timestamp === 'number' ? data.timestamp : null);
          rows.push({
            id: d.id,
            patientId: data.patientId,
            patientName: data.patientName || 'Linked patient',
            lat: typeof data.lat === 'number' ? data.lat : null,
            lng: typeof data.lng === 'number' ? data.lng : null,
            timestampMs: tsMs,
          });
        });
        // Newest first; alerts missing a server timestamp sort last.
        rows.sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0));
        setAlerts(rows);
      },
      (err) => {
        console.error('[CaregiverSOSBanner] snapshot failed', err);
      }
    );

    return () => unsub();
  }, [role, querablePatientIds]);

  if (role !== 'caregiver' || alerts.length === 0) return null;

  const headline = alerts[0];
  const count = alerts.length;

  const handleAck = async (id: string) => {
    setAckingId(id);
    try {
      await acknowledgeSOSAlert(id);
    } catch (err) {
      console.error('[CaregiverSOSBanner] acknowledge failed', err);
    } finally {
      setAckingId(null);
    }
  };

  const labels = (() => {
    if (language === 'hi') {
      return {
        sosTitle: 'SOS आपातकाल',
        sosOne: 'मरीज़ ने सहायता माँगी है',
        sosMany: 'मरीज़ों ने सहायता माँगी है',
        viewMap: 'मानचित्र पर देखें',
        acknowledge: 'स्वीकार करें',
        noLocation: 'स्थान उपलब्ध नहीं',
        expand: 'विवरण देखें',
        collapse: 'छिपाएँ',
      };
    }
    if (language === 'ta') {
      return {
        sosTitle: 'SOS அவசரம்',
        sosOne: 'நோயாளி உதவி கோரியுள்ளார்',
        sosMany: 'நோயாளிகள் உதவி கோரியுள்ளனர்',
        viewMap: 'வரைபடத்தில் பார்',
        acknowledge: 'ஒப்புக்கொள்',
        noLocation: 'இடம் இல்லை',
        expand: 'விரிவாக்கு',
        collapse: 'மறை',
      };
    }
    return {
      sosTitle: 'SOS Emergency',
      sosOne: 'patient needs help',
      sosMany: 'patients need help',
      viewMap: 'View on map',
      acknowledge: 'Acknowledge',
      noLocation: 'Location unavailable',
      expand: 'Show details',
      collapse: 'Hide',
    };
  })();

  return (
    <div
      className="sticky top-[72px] z-30 bg-danger border-b border-danger-dark shadow-soft animate-fade-in"
      role="alert"
      aria-live="assertive"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 lg:px-8 py-3 text-left tactile-btn"
        style={{ minHeight: 56 }}
        aria-expanded={expanded}
      >
        {/* pulsing dot */}
        <span className="relative inline-flex items-center justify-center w-6 h-6 shrink-0">
          <span className="absolute inset-0 rounded-full bg-white/40 animate-ping" />
          <span className="relative w-3 h-3 rounded-full bg-white" />
        </span>

        <AlertTriangle size={22} className="text-white shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-white/85">
            {labels.sosTitle}
          </div>
          <div className="text-sm sm:text-base font-medium text-white truncate">
            {count === 1
              ? `${headline.patientName} — ${labels.sosOne}`
              : `${count} ${labels.sosMany}`}
          </div>
        </div>

        <span className="hidden sm:inline text-xs font-medium uppercase tracking-wider text-white/85">
          {expanded ? labels.collapse : labels.expand}
        </span>
        {expanded ? (
          <ChevronUp size={20} className="text-white shrink-0" />
        ) : (
          <ChevronDown size={20} className="text-white shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="bg-danger-dark border-t border-white/15 px-4 lg:px-8 py-3 space-y-2">
          {alerts.map((a) => {
            const mapUrl =
              a.lat != null && a.lng != null
                ? `https://maps.google.com/maps?q=${a.lat},${a.lng}`
                : null;
            const isAcking = ackingId === a.id;
            return (
              <div
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white/10 border border-white/20 rounded-card p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-base font-medium text-white truncate">
                    {a.patientName}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm font-medium text-white/85">
                    <span>{formatRelative(a.timestampMs, language)}</span>
                    {a.lat == null && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={14} />
                        <span>{labels.noLocation}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {mapUrl && (
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-sm font-medium px-4 rounded-card border border-white/30 tactile-btn"
                      style={{ minHeight: 48 }}
                    >
                      <MapPin size={16} />
                      <span>{labels.viewMap}</span>
                    </a>
                  )}
                  <button
                    onClick={() => handleAck(a.id)}
                    disabled={isAcking}
                    className="inline-flex items-center gap-2 bg-white hover:bg-navy-950 text-danger-dark text-sm font-medium px-5 rounded-card shadow-soft tactile-btn disabled:opacity-60"
                    style={{ minHeight: 48 }}
                  >
                    {isAcking ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={18} strokeWidth={2.5} />
                    )}
                    <span>{labels.acknowledge}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CaregiverSOSBanner;
