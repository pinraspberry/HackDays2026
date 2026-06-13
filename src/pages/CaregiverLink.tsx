import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  addDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useFirebase } from '../context/FirebaseContext';
import { useRole } from '../context/RoleContext';
import { useSettings } from '../context/SettingsContext';
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Users,
  ShieldCheck,
  Trash2,
  Eye,
  Plus,
  FileText,
  Clock,
  AlertCircle,
} from 'lucide-react';

const CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CaregiverLinkDoc {
  id: string;
  inviteCode: string;
  patientId: string;
  caregiverId: string | null;
  caregiverName?: string;
  status: 'pending' | 'active' | 'revoked' | 'expired';
  createdAt: any;
  expiresAtMs: number; // milliseconds since epoch (we store both server stamp + numeric)
  permissions: {
    viewMedicines: boolean;
    viewDocuments: boolean;
    addMedicines: boolean;
  };
}

const generateInviteCode = (): string => {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return s;
};

const formatCountdown = (ms: number): string => {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const CaregiverLink: React.FC = () => {
  const { user } = useFirebase();
  const { language } = useSettings();
  const { profile, refreshLinkedPatients } = useRole();

  const [pendingLinks, setPendingLinks] = useState<CaregiverLinkDoc[]>([]);
  const [activeLinks, setActiveLinks] = useState<CaregiverLinkDoc[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);

  // Subscribe to caregiverLinks where patientId == current user
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'caregiverLinks'),
      where('patientId', '==', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const pending: CaregiverLinkDoc[] = [];
        const active: CaregiverLinkDoc[] = [];
        snap.forEach((d) => {
          const data = d.data() as Omit<CaregiverLinkDoc, 'id'>;
          const row: CaregiverLinkDoc = { id: d.id, ...data };
          if (row.status === 'pending') pending.push(row);
          else if (row.status === 'active') active.push(row);
        });
        // newest first
        pending.sort((a, b) => (b.expiresAtMs || 0) - (a.expiresAtMs || 0));
        active.sort((a, b) => (b.expiresAtMs || 0) - (a.expiresAtMs || 0));
        setPendingLinks(pending);
        setActiveLinks(active);
      },
      (err) => console.error('caregiverLinks snapshot failed', err)
    );
    return () => unsub();
  }, [user]);

  // Tick every second to refresh countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const livePending = useMemo(
    () => pendingLinks.filter((l) => l.expiresAtMs > now),
    [pendingLinks, now]
  );

  const handleGenerate = async () => {
    if (!user) return;
    setError(null);
    setGenerating(true);
    try {
      const inviteCode = generateInviteCode();
      const expiresAtMs = Date.now() + CODE_TTL_MS;
      await addDoc(collection(db, 'caregiverLinks'), {
        inviteCode,
        patientId: user.uid,
        caregiverId: null,
        status: 'pending',
        createdAt: serverTimestamp(),
        expiresAtMs,
        permissions: {
          viewMedicines: true,
          viewDocuments: false,
          addMedicines: false,
        },
      });
    } catch (err: any) {
      console.error('generate invite failed', err);
      setError(err?.message || 'Could not generate an invite code.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('clipboard write failed', err);
    }
  };

  const handleTogglePermission = async (
    link: CaregiverLinkDoc,
    key: keyof CaregiverLinkDoc['permissions']
  ) => {
    try {
      await updateDoc(doc(db, `caregiverLinks/${link.id}`), {
        [`permissions.${key}`]: !link.permissions[key],
      });
    } catch (err) {
      console.error('update permission failed', err);
    }
  };

  const handleRevoke = async (link: CaregiverLinkDoc) => {
    if (!user) return;
    const ok = confirm(
      language === 'hi'
        ? 'क्या आप इस केयरगिवर का एक्सेस हटाना चाहते हैं?'
        : "Revoke this caregiver's access?"
    );
    if (!ok) return;
    try {
      await updateDoc(doc(db, `caregiverLinks/${link.id}`), { status: 'revoked' });

      // Remove from each user's denormalised arrays
      if (link.caregiverId) {
        await updateDoc(doc(db, `users/${user.uid}`), {
          linkedCaregiverIds: arrayRemove(link.caregiverId),
        });
        try {
          await updateDoc(doc(db, `users/${link.caregiverId}`), {
            linkedPatientIds: arrayRemove(user.uid),
          });
        } catch (err) {
          console.warn('caregiver linkedPatientIds update skipped', err);
        }
      }
      refreshLinkedPatients();
    } catch (err) {
      console.error('revoke failed', err);
    }
  };

  const handleCancelPending = async (link: CaregiverLinkDoc) => {
    try {
      await setDoc(doc(db, `caregiverLinks/${link.id}`), { status: 'expired' }, { merge: true });
    } catch (err) {
      console.error('cancel pending failed', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-medium text-navy-50 flex items-center gap-2">
            <Sparkles size={20} className="text-accent" />
            <span>{language === 'hi' ? 'केयरगिवर लिंक' : 'Link a Caregiver'}</span>
          </h2>
          <p className="text-sm text-navy-700 mt-0.5 max-w-2xl">
            {language === 'hi'
              ? 'अपने परिवार या केयरगिवर को आपकी दवाइयाँ देखने की अनुमति दें — आप कभी भी एक्सेस हटा सकते हैं।'
              : 'Share a 24-hour invite code with a family member or caregiver so they can view your care plan. You can revoke access at any time.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="card-navy bg-warning-light border-warning/30 flex items-start gap-2">
          <AlertCircle size={18} className="text-warning-dark mt-0.5 shrink-0" />
          <span className="text-sm text-warning-dark font-medium">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* ===== Generate / pending invites ===== */}
        <div className="card-navy">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-card bg-accent/10 border border-accent/30 flex items-center justify-center text-accent">
                <Plus size={16} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-navy-50">
                  {language === 'hi' ? 'नया इनवाइट कोड' : 'New invite code'}
                </h3>
                <p className="text-xs text-navy-700">
                  {language === 'hi'
                    ? '24 घंटे तक मान्य'
                    : 'Valid for 24 hours'}
                </p>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium px-5 rounded-card shadow-soft tactile-btn disabled:opacity-60 text-sm"
              style={{ minHeight: 48 }}
            >
              {generating ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>{generating ? 'Generating…' : 'Generate'}</span>
            </button>
          </div>

          {livePending.length === 0 ? (
            <div className="bg-navy-950 border border-dashed border-navy-800 rounded-card p-6 text-center">
              <FileText size={28} className="mx-auto mb-2 text-navy-700 opacity-50" />
              <p className="text-sm font-medium text-navy-100">
                {language === 'hi' ? 'कोई सक्रिय कोड नहीं' : 'No active invite codes'}
              </p>
              <p className="text-xs text-navy-700 mt-1 max-w-sm mx-auto leading-relaxed">
                {language === 'hi'
                  ? 'जनरेट पर क्लिक करें — कोड को केयरगिवर के साथ सुरक्षित रूप से साझा करें।'
                  : 'Click Generate to create a one-time code. Share it privately with your caregiver.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {livePending.map((link) => {
                const remaining = link.expiresAtMs - now;
                return (
                  <div
                    key={link.id}
                    className="bg-navy-950 border border-navy-800 rounded-card p-5 space-y-4"
                  >
                    {/* Code display */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium uppercase tracking-widest text-navy-700">
                          {language === 'hi' ? 'इनवाइट कोड' : 'Invite Code'}
                        </div>
                        <div className="font-mono font-medium text-3xl sm:text-4xl text-navy-50 tracking-[0.3em] mt-1">
                          {link.inviteCode}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopy(link.inviteCode)}
                        className="inline-flex items-center gap-1.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent font-medium rounded-card px-3 tactile-btn"
                        style={{ minHeight: 48 }}
                      >
                        {copied ? <Check size={15} /> : <Copy size={15} />}
                        <span className="text-xs">{copied ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>

                    {/* Countdown */}
                    <div className="flex items-center gap-3 bg-navy-900 border border-navy-800 rounded-card p-3">
                      <Clock size={14} className="text-accent" />
                      <div className="flex-1">
                        <div className="text-xs font-medium uppercase tracking-widest text-navy-700">
                          {language === 'hi' ? 'समाप्त होने में' : 'Expires in'}
                        </div>
                        <div className="font-mono font-medium text-sm text-navy-50">
                          {formatCountdown(remaining)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelPending(link)}
                        className="text-sm font-medium text-danger-dark hover:text-danger tactile-btn"
                        style={{ minHeight: 36 }}
                      >
                        {language === 'hi' ? 'रद्द करें' : 'Cancel'}
                      </button>
                    </div>

                    <div className="flex items-start gap-2 text-xs text-navy-700">
                      <ShieldCheck size={13} className="text-success mt-0.5" />
                      <span>
                        {language === 'hi'
                          ? 'इस कोड को केवल भरोसेमंद व्यक्ति के साथ साझा करें।'
                          : 'Share this code only with someone you trust. They can join PULSE and link it on their dashboard.'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== Active caregivers list ===== */}
        <div className="card-navy">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-card bg-success/10 border border-success/30 flex items-center justify-center text-success">
                <Users size={16} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-navy-50">
                  {language === 'hi' ? 'जुड़े हुए केयरगिवर' : 'Active caregivers'}
                </h3>
                <p className="text-xs text-navy-700">
                  {activeLinks.length} {activeLinks.length === 1 ? 'caregiver' : 'caregivers'}
                </p>
              </div>
            </div>
          </div>

          {activeLinks.length === 0 ? (
            <div className="bg-navy-950 border border-dashed border-navy-800 rounded-card p-6 text-center">
              <Users size={28} className="mx-auto mb-2 text-navy-700 opacity-50" />
              <p className="text-sm font-medium text-navy-100">
                {language === 'hi' ? 'कोई केयरगिवर नहीं जुड़ा' : 'No caregivers connected yet'}
              </p>
              <p className="text-xs text-navy-700 mt-1 leading-relaxed max-w-sm mx-auto">
                {language === 'hi'
                  ? 'जब केयरगिवर आपका कोड डालेगा तो वह यहाँ दिखेगा।'
                  : 'Once a caregiver enters your code, they will appear here with their permissions.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeLinks.map((link) => (
                <div
                  key={link.id}
                  className="bg-navy-950 border border-navy-800 rounded-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-dark text-navy-50 font-medium text-sm flex items-center justify-center shrink-0">
                        {(link.caregiverName || 'C').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-navy-50 truncate">
                          {link.caregiverName || link.caregiverId || 'Caregiver'}
                        </div>
                        <div className="text-xs text-success font-medium uppercase tracking-wider">
                          {language === 'hi' ? 'सक्रिय' : 'Active'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(link)}
                      className="inline-flex items-center gap-1.5 text-danger-dark hover:text-danger bg-navy-900 hover:bg-danger-light border border-danger/20 hover:border-danger/40 rounded-card px-4 tactile-btn"
                      style={{ minHeight: 40 }}
                      aria-label="Revoke access"
                    >
                      <Trash2 size={13} />
                      <span className="text-xs font-medium">
                        {language === 'hi' ? 'हटाएँ' : 'Revoke'}
                      </span>
                    </button>
                  </div>

                  {/* Permission toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <PermissionToggle
                      label={language === 'hi' ? 'दवाइयाँ देखें' : 'View Medicines'}
                      icon={<Eye size={13} />}
                      checked={link.permissions.viewMedicines}
                      onToggle={() => handleTogglePermission(link, 'viewMedicines')}
                    />
                    <PermissionToggle
                      label={language === 'hi' ? 'दस्तावेज़ देखें' : 'View Documents'}
                      icon={<FileText size={13} />}
                      checked={link.permissions.viewDocuments}
                      onToggle={() => handleTogglePermission(link, 'viewDocuments')}
                    />
                    <PermissionToggle
                      label={language === 'hi' ? 'दवाई जोड़ें' : 'Add Medicines'}
                      icon={<Plus size={13} />}
                      checked={link.permissions.addMedicines}
                      onToggle={() => handleTogglePermission(link, 'addMedicines')}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* footer help */}
      <div className="card-navy bg-accent/[0.03] border-accent/15 flex items-start gap-3">
        <ShieldCheck size={16} className="text-accent mt-0.5 shrink-0" />
        <div className="text-sm text-navy-100 leading-relaxed">
          <strong className="text-navy-50">
            {language === 'hi' ? 'सुरक्षा सुझाव:' : 'Safety tip:'}
          </strong>{' '}
          {language === 'hi'
            ? 'इनवाइट कोड एक बार उपयोग के लिए होता है और 24 घंटे में स्वतः समाप्त हो जाता है। केवल जिस व्यक्ति पर भरोसा हो उसे ही दें।'
            : 'Each invite code is single-use and expires after 24 hours. Only share it with people you trust — you can revoke access any time below.'}
        </div>
      </div>

      {/* Hidden details for completeness; not used yet but available */}
      <div className="hidden">{profile?.linkedCaregiverIds?.length}</div>
    </div>
  );
};

const PermissionToggle: React.FC<{
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
}> = ({ label, icon, checked, onToggle }) => (
  <button
    onClick={onToggle}
    className={`flex items-center justify-between gap-2 px-3 rounded-card border text-left tactile-btn transition-all ${
      checked
        ? 'bg-accent/10 border-accent/40'
        : 'bg-navy-900 border-navy-800 hover:border-navy-750'
    }`}
    style={{ minHeight: 48 }}
  >
    <span className={`flex items-center gap-2 ${checked ? 'text-accent' : 'text-navy-100'}`}>
      {icon}
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
    </span>
    <span
      className={`relative inline-block w-8 h-4 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-navy-800'
      }`}
    >
      <span
        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
          checked ? 'left-4' : 'left-0.5'
        }`}
      />
    </span>
  </button>
);

export default CaregiverLink;
