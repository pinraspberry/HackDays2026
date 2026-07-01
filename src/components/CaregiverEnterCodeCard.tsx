import React, { useState } from 'react';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useFirebase } from '../context/FirebaseContext';
import { useRole } from '../context/RoleContext';
import { useSettings } from '../context/SettingsContext';
import {
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Users,
} from 'lucide-react';

/**
 * Caregiver-only card for the home dashboard. Accepts an invite code from a
 * patient, validates it server-side, and stitches the link doc + both users'
 * arrays together so the patient appears in the caregiver's switcher.
 */
export const CaregiverEnterCodeCard: React.FC = () => {
  const { user } = useFirebase();
  const { profile, refreshLinkedPatients } = useRole();
  const { language } = useSettings();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setSuccess(null);

    const cleaned = code.trim().toUpperCase();
    if (cleaned.length !== 6) {
      setError(
        language === 'hi'
          ? 'कोड 6 अक्षर का होना चाहिए।'
          : 'Invite code must be 6 characters.'
      );
      return;
    }
    if (!user) return;

    setSubmitting(true);
    try {
      // Find a pending, non-expired link with this code
      const q = query(
        collection(db, 'caregiverLinks'),
        where('inviteCode', '==', cleaned),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError(
          language === 'hi'
            ? 'अमान्य या समाप्त कोड।'
            : 'That invite code is invalid or has been used.'
        );
        return;
      }

      let matchId: string | null = null;
      let matchData: any = null;
      const nowMs = Date.now();
      snap.forEach((d) => {
        const data = d.data() as any;
        if (matchId) return;
        if ((data.expiresAtMs || 0) > nowMs) {
          matchId = d.id;
          matchData = data;
        }
      });

      if (!matchId || !matchData) {
        setError(
          language === 'hi'
            ? 'यह कोड समाप्त हो गया है। मरीज़ से नया कोड माँगें।'
            : 'This code has expired. Ask the patient for a fresh code.'
        );
        return;
      }

      const patientId: string = matchData.patientId;
      if (patientId === user.uid) {
        setError(
          language === 'hi'
            ? 'आप अपने ही कोड का उपयोग नहीं कर सकते।'
            : 'You cannot link your own invite code.'
        );
        return;
      }

      // Resolve the patient's display name (best-effort). Prefer the
      // new `fullName` from the personal-details step; fall back to the
      // legacy `displayName` for accounts created before this change.
      let patientName = 'Patient';
      try {
        const patientSnap = await getDoc(doc(db, `users/${patientId}`));
        if (patientSnap.exists()) {
          const p = patientSnap.data() as any;
          patientName =
            p.fullName || p.displayName || p.phoneNumber || 'Patient';
        }
      } catch {}

      const caregiverName =
        profile?.fullName || profile?.displayName || user.email || 'Caregiver';

      // 1) Update the link doc
      await updateDoc(doc(db, `caregiverLinks/${matchId}`), {
        caregiverId: user.uid,
        caregiverName,
        status: 'active',
        linkedAt: serverTimestamp(),
      });

      // 2) Add denormalised cross-references so quick lookups don't need queries
      await setDoc(
        doc(db, `users/${user.uid}`),
        {
          linkedPatientIds: arrayUnion(patientId),
        } as any,
        { merge: true }
      );
      await setDoc(
        doc(db, `users/${patientId}`),
        {
          linkedCaregiverIds: arrayUnion(user.uid),
        } as any,
        { merge: true }
      );

      setSuccess(
        language === 'hi'
          ? `${patientName} से जुड़ गए! बाएँ साइडबार से उन्हें चुनें।`
          : `Linked to ${patientName}! Open the patient switcher (top left) to view their dashboard.`
      );
      setCode('');
      refreshLinkedPatients();
    } catch (err: any) {
      console.error('link by code failed', err);
      setError(err?.message || 'Could not link the patient.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card-navy">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-card bg-success/10 border border-success/30 flex items-center justify-center text-success shrink-0">
          <KeyRound size={18} />
        </div>
        <div>
          <h3 className="text-base font-medium text-navy-50">
            {language === 'hi' ? 'मरीज़ से जुड़ें' : 'Link a patient'}
          </h3>
          <p className="text-xs text-navy-700">
            {language === 'hi'
              ? 'मरीज़ से 6-अक्षर का इनवाइट कोड लें और यहाँ डालें।'
              : 'Ask the patient to share their 6-character invite code from PULSE.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 bg-warning-light border border-warning/30 rounded-card p-3 text-sm text-warning-dark animate-fade-in">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-3 flex items-start gap-2 bg-success/10 border border-success/30 rounded-card p-3 text-xs text-success animate-fade-in">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="A8B7C2"
          autoComplete="one-time-code"
          maxLength={6}
          className="flex-1 bg-navy-950 border border-navy-800 rounded-card py-2 px-4 text-lg text-center text-navy-50 tracking-[0.4em] font-mono outline-none focus:border-accent uppercase"
          style={{ minHeight: 48 }}
        />
        <button
          type="submit"
          disabled={submitting || code.trim().length !== 6}
          className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium px-5 rounded-card shadow-soft tactile-btn disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: 48 }}
        >
          {submitting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span className="text-sm">Linking…</span>
            </>
          ) : (
            <>
              <span className="text-sm">{language === 'hi' ? 'मरीज़ जोड़ें' : 'Link Patient'}</span>
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      <div className="flex items-center gap-2 mt-3 text-xs text-navy-700">
        <Users size={12} />
        <span>
          {language === 'hi'
            ? `अभी ${profile?.linkedPatientIds?.length || 0} मरीज़ जुड़े हुए।`
            : `${profile?.linkedPatientIds?.length || 0} patients currently linked.`}
        </span>
      </div>
    </div>
  );
};

export default CaregiverEnterCodeCard;
