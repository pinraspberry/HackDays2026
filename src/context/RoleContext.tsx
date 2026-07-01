import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useFirebase } from './FirebaseContext';

export type UserRole = 'patient' | 'caregiver';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-';

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface LinkedPatientRow {
  userId: string;
  name: string;
  email?: string;
  adherencePercent: number;
  medicineCount: number;
}

export interface UserProfile {
  role?: UserRole;
  phoneNumber?: string;
  linkedPatientIds?: string[];
  linkedCaregiverIds?: string[];
  activePatientId?: string | null;
  displayName?: string;

  // PULSE — modified
  // Personal/medical details captured during the new onboarding step.
  // All fields are optional so legacy docs (pre-this-change) keep
  // working; new accounts always populate at least fullName + DOB.
  fullName?: string;
  dateOfBirth?: string; // ISO YYYY-MM-DD; age derived at read-time
  gender?: Gender;

  // Patient-only medical basics. Caregivers leave these undefined.
  bloodGroup?: BloodGroup;
  heightCm?: number;
  weightKg?: number;
  allergies?: string[];
  conditions?: string[];
  conditionsNotes?: string;

  emergencyContact?: EmergencyContact;
  detailsCompletedAt?: string;
}

/**
 * Returns age in whole years for an ISO YYYY-MM-DD date string. Returns
 * null when the input is missing or unparseable so callers can decide
 * what to render in the empty state (e.g. an em-dash).
 */
export const computeAge = (dob?: string | null): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
};

/**
 * Preset condition chips shown in the personal-details form. Kept here
 * (rather than inline in the form) so other consumers — e.g. the PDF
 * report or future analytics — can reference the canonical labels.
 */
export const CONDITION_PRESETS: string[] = [
  'Diabetes',
  'Hypertension',
  'Asthma',
  'Heart',
  'Thyroid',
  'Cholesterol',
  'Arthritis',
  'Kidney',
  'Cancer',
  'Other',
];

interface RoleContextType {
  role: UserRole | null;
  profile: UserProfile | null;
  profileLoading: boolean;
  phoneNumber: string | null;
  linkedPatientIds: string[];
  linkedCaregiverIds: string[];
  linkedPatients: LinkedPatientRow[];
  linkedPatientsLoading: boolean;
  activePatientId: string | null;
  activePatientName: string | null;
  setActivePatientId: (id: string | null) => void;
  saveRole: (role: UserRole) => Promise<void>;
  savePhoneNumber: (phoneNumber: string) => Promise<void>;
  saveDisplayName: (name: string) => Promise<void>;
  savePersonalDetails: (patch: Partial<UserProfile>) => Promise<void>;
  refreshLinkedPatients: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

const userDocRef = (uid: string) => doc(db, `users/${uid}`);

/**
 * Computes 7-day adherence + active medicine count for a given user, by
 * reading their `medications` and `logs` subcollections directly. Falls
 * back gracefully to 0/100 when nothing is logged yet.
 */
async function fetchAdherenceFor(userId: string): Promise<{
  adherencePercent: number;
  medicineCount: number;
}> {
  try {
    const medsSnap = await getDocs(collection(db, `users/${userId}/medications`));
    const meds: any[] = [];
    medsSnap.forEach((d) => meds.push({ id: d.id, ...d.data() }));

    const logsSnap = await getDocs(collection(db, `users/${userId}/logs`));
    const logs: Record<string, any> = {};
    logsSnap.forEach((d) => (logs[d.id] = d.data()));

    if (meds.length === 0) return { adherencePercent: 100, medicineCount: 0 };

    let total = 0;
    let taken = 0;
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLog = logs[dateStr] || {};
      const active = meds.filter((m) => (m.startDate ?? '0000-00-00') <= dateStr);
      active.forEach((m: any) => {
        (m.timing || []).forEach((slot: string) => {
          total++;
          if (dayLog[`${m.id}_${slot}`]?.taken) taken++;
        });
      });
    }

    const percent = total > 0 ? Math.round((taken / total) * 100) : 100;
    return { adherencePercent: percent, medicineCount: meds.length };
  } catch (err) {
    console.warn('fetchAdherenceFor failed for', userId, err);
    return { adherencePercent: 0, medicineCount: 0 };
  }
}

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useFirebase();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [linkedPatients, setLinkedPatients] = useState<LinkedPatientRow[]>([]);
  const [linkedPatientsLoading, setLinkedPatientsLoading] = useState(false);

  // activePatientId is per-session for caregivers and isn't persisted to
  // Firestore, so a caregiver always starts the session viewing their own
  // dashboard until they explicitly switch.
  const [activePatientId, setActivePatientIdState] = useState<string | null>(null);

  // Subscribe to the current user's profile doc.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const unsub = onSnapshot(
      userDocRef(user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        } else {
          setProfile({} as UserProfile);
        }
        setProfileLoading(false);
      },
      (err) => {
        console.error('profile snapshot error', err);
        setProfile({} as UserProfile);
        setProfileLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  const linkedPatientIds = useMemo(() => profile?.linkedPatientIds ?? [], [profile]);
  const linkedCaregiverIds = useMemo(() => profile?.linkedCaregiverIds ?? [], [profile]);

  // For caregivers, hydrate the linkedPatients summary list from Firestore.
  const refreshLinkedPatients = useCallback(async () => {
    if (!user || profile?.role !== 'caregiver' || linkedPatientIds.length === 0) {
      setLinkedPatients([]);
      return;
    }

    setLinkedPatientsLoading(true);
    try {
      const rows: LinkedPatientRow[] = await Promise.all(
        linkedPatientIds.map(async (pid) => {
          const profSnap = await getDoc(userDocRef(pid));
          const p = profSnap.exists() ? (profSnap.data() as UserProfile) : {};
          const { adherencePercent, medicineCount } = await fetchAdherenceFor(pid);
          return {
            userId: pid,
            name:
              p.fullName ||
              p.displayName ||
              p.phoneNumber ||
              'Linked Patient',
            email: undefined,
            adherencePercent,
            medicineCount,
          };
        })
      );
      setLinkedPatients(rows);
    } catch (err) {
      console.error('refreshLinkedPatients failed', err);
    } finally {
      setLinkedPatientsLoading(false);
    }
  }, [user, profile, linkedPatientIds]);

  // Refresh whenever the linkedPatientIds list changes.
  useEffect(() => {
    refreshLinkedPatients();
  }, [refreshLinkedPatients]);

  const setActivePatientId = useCallback((id: string | null) => {
    setActivePatientIdState(id);
  }, []);

  const saveRole = useCallback(
    async (role: UserRole) => {
      if (!user) return;
      await setDoc(
        userDocRef(user.uid),
        {
          role,
          email: user.email || null,
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );
    },
    [user]
  );

  const savePhoneNumber = useCallback(
    async (phoneNumber: string) => {
      if (!user) return;
      await setDoc(userDocRef(user.uid), { phoneNumber }, { merge: true });
    },
    [user]
  );

  const saveDisplayName = useCallback(
    async (name: string) => {
      if (!user) return;
      await setDoc(userDocRef(user.uid), { displayName: name }, { merge: true });
    },
    [user]
  );

  // PULSE — modified
  // Single write that merges any subset of personal/medical fields into
  // the user doc. Used by the onboarding "Details" step on first run
  // and by the My Profile edit page later. Stamps detailsCompletedAt
  // whenever a write goes through so we can tell "filled at least once"
  // apart from "still empty".
  const savePersonalDetails = useCallback(
    async (patch: Partial<UserProfile>) => {
      if (!user) return;
      const payload: Record<string, any> = {
        ...patch,
        detailsCompletedAt: new Date().toISOString(),
      };
      // Mirror fullName into the legacy `displayName` field so older
      // call sites (SOS pipeline, caregiver link) that haven't migrated
      // yet keep showing the new name immediately.
      if (typeof patch.fullName === 'string' && patch.fullName.trim()) {
        payload.displayName = patch.fullName.trim();
      }
      await setDoc(userDocRef(user.uid), payload, { merge: true });
    },
    [user]
  );

  const role = (profile?.role as UserRole | undefined) ?? null;
  const phoneNumber = profile?.phoneNumber ?? null;

  const activePatientName =
    linkedPatients.find((p) => p.userId === activePatientId)?.name ?? null;

  // Reset active selection if it disappears from the linked list (e.g. revoked)
  useEffect(() => {
    if (activePatientId && !linkedPatientIds.includes(activePatientId)) {
      setActivePatientIdState(null);
    }
  }, [activePatientId, linkedPatientIds]);

  const value: RoleContextType = {
    role,
    profile,
    profileLoading,
    phoneNumber,
    linkedPatientIds,
    linkedCaregiverIds,
    linkedPatients,
    linkedPatientsLoading,
    activePatientId,
    activePatientName,
    setActivePatientId,
    saveRole,
    savePhoneNumber,
    saveDisplayName,
    savePersonalDetails,
    refreshLinkedPatients,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};

export const useRole = () => {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
};

/* ===================================================================
 * useActivePatient
 *
 * Returns the user id whose data subtree should be read. For patients
 * this is always their own uid; for caregivers it's whichever patient
 * they have switched to (or their own uid when no patient is selected).
 * ================================================================= */
export interface ActivePatientResolution {
  patientId: string | null;
  isOwnData: boolean;
  isCaregiverViewing: boolean;
  basePath: string | null; // e.g. "users/<uid>"
  medicationsPath: string | null;
  documentsPath: string | null;
  logsPath: string | null;
}

export const useActivePatient = (): ActivePatientResolution => {
  const { user } = useFirebase();
  const { role, activePatientId } = useRole();

  if (!user) {
    return {
      patientId: null,
      isOwnData: false,
      isCaregiverViewing: false,
      basePath: null,
      medicationsPath: null,
      documentsPath: null,
      logsPath: null,
    };
  }

  const isCaregiverViewing = role === 'caregiver' && !!activePatientId;
  const patientId = isCaregiverViewing ? (activePatientId as string) : user.uid;
  const basePath = `users/${patientId}`;

  return {
    patientId,
    isOwnData: patientId === user.uid,
    isCaregiverViewing,
    basePath,
    medicationsPath: `${basePath}/medications`,
    documentsPath: `${basePath}/documents`,
    logsPath: `${basePath}/logs`,
  };
};
