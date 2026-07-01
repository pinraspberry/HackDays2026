// PULSE — modified
// Editable view of the user's personal/medical details captured during
// onboarding. Reuses the shared PersonalDetailsForm so the field set
// and validation stay in lock-step with the first-run flow. Read-only
// for caregivers viewing a linked patient — they're editing their own
// profile, not the patient's.
import React from 'react';
import { useRole, computeAge } from '../context/RoleContext';
import { useFirebase } from '../context/FirebaseContext';
import { useSettings } from '../context/SettingsContext';
import PersonalDetailsForm from '../components/PersonalDetailsForm';
import { Loader2, UserCircle2 } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user } = useFirebase();
  const { role, profile, profileLoading, savePersonalDetails } = useRole();
  const { language } = useSettings();

  if (profileLoading || !role) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-navy-100">
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-accent" />
          <span className="text-base font-medium">
            {language === 'hi' ? 'प्रोफ़ाइल लोड हो रही है…' : 'Loading profile…'}
          </span>
        </div>
      </div>
    );
  }

  const age = computeAge(profile?.dateOfBirth);
  const displayedName =
    profile?.fullName || profile?.displayName || user?.email || 'PULSE User';
  const initial = displayedName.charAt(0).toUpperCase();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center text-2xl font-medium shadow-soft shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-medium text-navy-50 tracking-tight flex items-center gap-2">
            <UserCircle2 size={26} className="text-accent shrink-0" />
            <span className="truncate">
              {language === 'hi' ? 'मेरी प्रोफ़ाइल' : 'My Profile'}
            </span>
          </h2>
          <p className="text-sm text-navy-700 mt-1.5 truncate">
            {displayedName}
            {age != null && (
              <span className="text-navy-100">
                {' '}
                · {language === 'hi' ? `${age} साल` : `${age} yrs`}
              </span>
            )}
            <span className="text-navy-700"> · </span>
            <span className="uppercase tracking-wider text-xs font-medium text-accent">
              {role === 'patient'
                ? language === 'hi'
                  ? 'मरीज़'
                  : 'Patient'
                : language === 'hi'
                ? 'केयरगिवर'
                : 'Caregiver'}
            </span>
          </p>
          <p className="text-xs text-navy-700 mt-1 truncate">{user?.email}</p>
        </div>
      </div>

      <div className="bg-accent/5 border border-accent/20 rounded-card px-4 py-3 text-sm text-navy-100">
        {language === 'hi'
          ? 'यह जानकारी आपकी रिपोर्ट, दवा सलाह और आपात स्थिति में काम आती है। यहाँ कभी भी बदला जा सकता है।'
          : role === 'patient'
          ? 'These details flow into your adherence reports, dose recommendations, and the SOS pipeline. Keep them up to date.'
          : 'These details appear to linked patients and on emergency notifications you send on their behalf.'}
      </div>

      <PersonalDetailsForm
        role={role}
        initial={profile ?? undefined}
        submitLabel={language === 'hi' ? 'बदलाव सेव करें' : 'Save changes'}
        onSubmit={async (patch) => {
          await savePersonalDetails(patch);
        }}
      />
    </div>
  );
};

export default Profile;
