// PULSE — modified
// Shared "personal & medical details" form used both by the new
// Onboarding step 2 (first-run capture) and by the My Profile page
// (later edits). Field set adapts to the user's role:
//
//   • Both roles ............ name, DOB, gender, emergency contact
//   • Patients additionally . blood group, height, weight, allergies,
//                              conditions chips + free-text notes
//
// The component is fully controlled by the caller via initial + onSubmit
// so it has no Firestore knowledge of its own. It validates required
// fields locally, surfaces inline errors, and keeps copy bilingual
// (English + Hindi) to match the rest of the onboarding flow.
import React, { useMemo, useState } from 'react';
import {
  User as UserIcon,
  Cake,
  Droplet,
  Ruler,
  Weight,
  AlertCircle,
  Phone,
  HeartPulse,
  Loader2,
  CheckCircle2,
  Plus,
  X,
} from 'lucide-react';

import {
  CONDITION_PRESETS,
  computeAge,
  type BloodGroup,
  type Gender,
  type UserProfile,
  type UserRole,
} from '../context/RoleContext';
import { useSettings } from '../context/SettingsContext';

interface PersonalDetailsFormProps {
  role: UserRole;
  initial?: Partial<UserProfile>;
  submitLabel?: string;
  onSubmit: (patch: Partial<UserProfile>) => Promise<void>;
  /**
   * Optional cancel handler — when provided the form renders a
   * secondary "Cancel" button next to the submit CTA. Used by the
   * profile-edit page; left undefined during first-run onboarding.
   */
  onCancel?: () => void;
}

const GENDER_OPTIONS: { value: Gender; en: string; hi: string }[] = [
  { value: 'male', en: 'Male', hi: 'पुरुष' },
  { value: 'female', en: 'Female', hi: 'महिला' },
  { value: 'other', en: 'Other', hi: 'अन्य' },
  { value: 'prefer_not_to_say', en: 'Prefer not to say', hi: 'नहीं बताना' },
];

const BLOOD_GROUPS: BloodGroup[] = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
];

const todayIso = () => new Date().toISOString().split('T')[0];

export const PersonalDetailsForm: React.FC<PersonalDetailsFormProps> = ({
  role,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}) => {
  const { language } = useSettings();
  const isHi = language === 'hi';
  const isPatient = role === 'patient';

  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? '');
  const [gender, setGender] = useState<Gender | ''>(initial?.gender ?? '');

  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>(
    initial?.bloodGroup ?? ''
  );
  const [heightCm, setHeightCm] = useState<string>(
    initial?.heightCm != null ? String(initial.heightCm) : ''
  );
  const [weightKg, setWeightKg] = useState<string>(
    initial?.weightKg != null ? String(initial.weightKg) : ''
  );

  const [allergies, setAllergies] = useState<string[]>(initial?.allergies ?? []);
  const [allergyDraft, setAllergyDraft] = useState('');

  const [conditions, setConditions] = useState<string[]>(
    initial?.conditions ?? []
  );
  const [conditionsNotes, setConditionsNotes] = useState(
    initial?.conditionsNotes ?? ''
  );

  const [emergencyName, setEmergencyName] = useState(
    initial?.emergencyContact?.name ?? ''
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    initial?.emergencyContact?.phone ?? ''
  );
  const [emergencyRelationship, setEmergencyRelationship] = useState(
    initial?.emergencyContact?.relationship ?? ''
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const age = useMemo(() => computeAge(dateOfBirth), [dateOfBirth]);

  const toggleCondition = (label: string) => {
    setConditions((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]
    );
  };

  const addAllergyFromDraft = () => {
    const cleaned = allergyDraft.trim();
    if (!cleaned) return;
    if (allergies.some((a) => a.toLowerCase() === cleaned.toLowerCase())) {
      setAllergyDraft('');
      return;
    }
    setAllergies((prev) => [...prev, cleaned]);
    setAllergyDraft('');
  };

  const removeAllergy = (a: string) => {
    setAllergies((prev) => prev.filter((x) => x !== a));
  };

  const handleAllergyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addAllergyFromDraft();
    } else if (e.key === 'Backspace' && allergyDraft === '' && allergies.length) {
      setAllergies((prev) => prev.slice(0, -1));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fullName.trim()) {
      setError(isHi ? 'कृपया अपना पूरा नाम डालें।' : 'Please enter your full name.');
      return;
    }
    if (!dateOfBirth) {
      setError(isHi ? 'जन्मतिथि चुनिए।' : 'Please select your date of birth.');
      return;
    }
    if (dateOfBirth > todayIso()) {
      setError(
        isHi ? 'जन्मतिथि भविष्य में नहीं हो सकती।' : 'Date of birth cannot be in the future.'
      );
      return;
    }
    if (age == null) {
      setError(isHi ? 'जन्मतिथि अमान्य है।' : 'That date of birth looks invalid.');
      return;
    }

    if (emergencyPhone && !/^\+?\d[\d\s-]{6,}$/.test(emergencyPhone.trim())) {
      setError(
        isHi
          ? 'आपातकालीन संपर्क नंबर सही नहीं लगता।'
          : 'That emergency contact phone number looks invalid.'
      );
      return;
    }

    const heightNum = heightCm.trim() ? Number(heightCm) : NaN;
    const weightNum = weightKg.trim() ? Number(weightKg) : NaN;
    if (heightCm.trim() && (Number.isNaN(heightNum) || heightNum <= 0 || heightNum > 280)) {
      setError(isHi ? 'ऊँचाई मान्य नहीं है।' : 'Height must be a positive number in centimetres.');
      return;
    }
    if (weightKg.trim() && (Number.isNaN(weightNum) || weightNum <= 0 || weightNum > 500)) {
      setError(isHi ? 'वज़न मान्य नहीं है।' : 'Weight must be a positive number in kilograms.');
      return;
    }

    // Add any pending allergy chip the user typed but didn't commit.
    if (allergyDraft.trim()) {
      addAllergyFromDraft();
    }

    const patch: Partial<UserProfile> = {
      fullName: fullName.trim(),
      dateOfBirth,
    };

    if (gender) patch.gender = gender as Gender;

    if (isPatient) {
      if (bloodGroup) patch.bloodGroup = bloodGroup as BloodGroup;
      if (!Number.isNaN(heightNum) && heightNum > 0) patch.heightCm = heightNum;
      if (!Number.isNaN(weightNum) && weightNum > 0) patch.weightKg = weightNum;
      patch.allergies = allergies;
      patch.conditions = conditions;
      patch.conditionsNotes = conditionsNotes.trim();
    }

    const ec = {
      name: emergencyName.trim(),
      phone: emergencyPhone.trim(),
      relationship: emergencyRelationship.trim(),
    };
    if (ec.name || ec.phone || ec.relationship) {
      patch.emergencyContact = ec;
    }

    setSubmitting(true);
    try {
      await onSubmit(patch);
      setSuccess(isHi ? 'विवरण सेव हो गया।' : 'Details saved.');
    } catch (err: any) {
      console.error('savePersonalDetails failed', err);
      setError(err?.message || 'Could not save your details. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Status banners */}
      {error && (
        <div
          className="flex items-start gap-3 bg-warning-light border border-warning/40 rounded-card p-4 text-sm text-warning-dark animate-fade-in"
          role="alert"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}
      {success && (
        <div
          className="flex items-start gap-3 bg-success-light border border-success/40 rounded-card p-4 text-sm text-success-dark animate-fade-in"
          role="status"
        >
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span className="leading-relaxed">{success}</span>
        </div>
      )}

      {/* ===== Core identity ===== */}
      <section className="card-navy space-y-4">
        <header className="flex items-center gap-2 text-navy-50">
          <UserIcon size={18} className="text-accent" />
          <h3 className="text-sm font-medium uppercase tracking-wider">
            {isHi ? 'आपकी पहचान' : 'About you'}
          </h3>
        </header>

        <div>
          <label htmlFor="pd-name" className="block text-sm font-medium text-navy-50 mb-2">
            {isHi ? 'पूरा नाम' : 'Full name'} <span className="text-danger">*</span>
          </label>
          <input
            id="pd-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={isHi ? 'जैसे: अनिल कुमार शर्मा' : 'e.g. Anil Kumar Sharma'}
            autoComplete="name"
            className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
            style={{ minHeight: 48 }}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pd-dob" className="block text-sm font-medium text-navy-50 mb-2">
              {isHi ? 'जन्मतिथि' : 'Date of birth'} <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <Cake
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-700 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="pd-dob"
                type="date"
                value={dateOfBirth}
                max={todayIso()}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full bg-navy-950 border border-navy-800 rounded-card pl-12 pr-4 text-base text-navy-50 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                style={{ minHeight: 48 }}
                required
              />
            </div>
            {age != null && (
              <div className="text-xs text-navy-700 mt-2">
                {isHi ? `उम्र: ${age} साल` : `Age: ${age} years`}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="pd-gender" className="block text-sm font-medium text-navy-50 mb-2">
              {isHi ? 'लिंग' : 'Gender'}
            </label>
            <select
              id="pd-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender | '')}
              className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
              style={{ minHeight: 48 }}
            >
              <option value="">{isHi ? 'चुनें' : 'Select…'}</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {isHi ? g.hi : g.en}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ===== Patient-only medical basics ===== */}
      {isPatient && (
        <section className="card-navy space-y-4">
          <header className="flex items-center gap-2 text-navy-50">
            <Droplet size={18} className="text-accent" />
            <h3 className="text-sm font-medium uppercase tracking-wider">
              {isHi ? 'मेडिकल जानकारी' : 'Medical basics'}
            </h3>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="pd-blood" className="block text-sm font-medium text-navy-50 mb-2">
                {isHi ? 'ब्लड ग्रुप' : 'Blood group'}
              </label>
              <select
                id="pd-blood"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value as BloodGroup | '')}
                className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                style={{ minHeight: 48 }}
              >
                <option value="">{isHi ? 'चुनें' : 'Select…'}</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pd-height" className="block text-sm font-medium text-navy-50 mb-2">
                {isHi ? 'ऊँचाई (सेमी)' : 'Height (cm)'}
              </label>
              <div className="relative">
                <Ruler
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-700 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="pd-height"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={280}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="168"
                  className="w-full bg-navy-950 border border-navy-800 rounded-card pl-12 pr-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                  style={{ minHeight: 48 }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="pd-weight" className="block text-sm font-medium text-navy-50 mb-2">
                {isHi ? 'वज़न (किग्रा)' : 'Weight (kg)'}
              </label>
              <div className="relative">
                <Weight
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-700 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="pd-weight"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={500}
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="72"
                  className="w-full bg-navy-950 border border-navy-800 rounded-card pl-12 pr-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                  style={{ minHeight: 48 }}
                />
              </div>
            </div>
          </div>

          {/* Allergies — chip input */}
          <div>
            <label htmlFor="pd-allergy" className="block text-sm font-medium text-navy-50 mb-2">
              {isHi ? 'एलर्जी' : 'Allergies'}
            </label>
            <div className="flex flex-wrap gap-2 mb-2" aria-live="polite">
              {allergies.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1.5 bg-accent/10 border border-accent/30 text-accent-dark rounded-pill px-3 py-1 text-sm font-medium"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => removeAllergy(a)}
                    aria-label={`Remove ${a}`}
                    className="text-accent-dark hover:text-danger"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                id="pd-allergy"
                type="text"
                value={allergyDraft}
                onChange={(e) => setAllergyDraft(e.target.value)}
                onKeyDown={handleAllergyKeyDown}
                placeholder={isHi ? 'जैसे: पेनिसिलिन, मूँगफली' : 'e.g. Penicillin, Peanuts'}
                className="flex-1 bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                style={{ minHeight: 48 }}
              />
              <button
                type="button"
                onClick={addAllergyFromDraft}
                disabled={!allergyDraft.trim()}
                className="inline-flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-dark text-white font-medium px-4 rounded-card shadow-soft tactile-btn disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ minHeight: 48 }}
              >
                <Plus size={16} />
                <span className="text-sm">{isHi ? 'जोड़ें' : 'Add'}</span>
              </button>
            </div>
            <p className="text-xs text-navy-700 mt-2">
              {isHi
                ? 'एंटर या कॉमा दबाकर जोड़ें।'
                : 'Press Enter or comma to add a chip.'}
            </p>
          </div>

          {/* Conditions — toggle chips + notes */}
          <div>
            <label className="block text-sm font-medium text-navy-50 mb-2">
              {isHi ? 'पुरानी बीमारियाँ' : 'Known conditions'}
            </label>
            <div className="flex flex-wrap gap-2">
              {CONDITION_PRESETS.map((c) => {
                const active = conditions.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCondition(c)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium border tactile-btn transition-colors ${
                      active
                        ? 'bg-accent text-white border-accent shadow-soft'
                        : 'bg-navy-950 text-navy-100 border-navy-800 hover:border-accent hover:text-accent-dark'
                    }`}
                    style={{ minHeight: 36 }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            <label htmlFor="pd-condition-notes" className="block text-sm font-medium text-navy-50 mt-4 mb-2">
              {isHi ? 'अन्य विवरण (वैकल्पिक)' : 'Other notes (optional)'}
            </label>
            <textarea
              id="pd-condition-notes"
              value={conditionsNotes}
              onChange={(e) => setConditionsNotes(e.target.value)}
              rows={3}
              placeholder={
                isHi
                  ? 'कोई और मेडिकल जानकारी जो डॉक्टर को बतानी हो...'
                  : 'Anything else your caregiver or doctor should know…'
              }
              className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 py-3 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
            />
          </div>
        </section>
      )}

      {/* ===== Emergency contact ===== */}
      <section className="card-navy space-y-4">
        <header className="flex items-center gap-2 text-navy-50">
          <HeartPulse size={18} className="text-danger" />
          <h3 className="text-sm font-medium uppercase tracking-wider">
            {isHi ? 'आपातकालीन संपर्क' : 'Emergency contact'}
          </h3>
        </header>
        <p className="text-xs text-navy-700">
          {isHi
            ? 'किसी आपात स्थिति में सबसे पहले इन्हें संपर्क किया जाएगा।'
            : 'The person we should reach first if anything goes wrong.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pd-ec-name" className="block text-sm font-medium text-navy-50 mb-2">
              {isHi ? 'नाम' : 'Name'}
            </label>
            <input
              id="pd-ec-name"
              type="text"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder={isHi ? 'जैसे: रीना शर्मा' : 'e.g. Reena Sharma'}
              autoComplete="name"
              className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
              style={{ minHeight: 48 }}
            />
          </div>

          <div>
            <label htmlFor="pd-ec-relationship" className="block text-sm font-medium text-navy-50 mb-2">
              {isHi ? 'रिश्ता' : 'Relationship'}
            </label>
            <input
              id="pd-ec-relationship"
              type="text"
              value={emergencyRelationship}
              onChange={(e) => setEmergencyRelationship(e.target.value)}
              placeholder={isHi ? 'जैसे: पत्नी, बेटा' : 'e.g. Spouse, Son'}
              className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
              style={{ minHeight: 48 }}
            />
          </div>
        </div>

        <div>
          <label htmlFor="pd-ec-phone" className="block text-sm font-medium text-navy-50 mb-2">
            {isHi ? 'मोबाइल नंबर' : 'Phone'}
          </label>
          <div className="relative">
            <Phone
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-700 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="pd-ec-phone"
              type="tel"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              className="w-full bg-navy-950 border border-navy-800 rounded-card pl-12 pr-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
              style={{ minHeight: 48 }}
            />
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 bg-navy-900 hover:bg-navy-850 text-navy-50 border border-navy-800 font-medium px-5 rounded-card tactile-btn disabled:opacity-50"
            style={{ minHeight: 48 }}
          >
            {isHi ? 'रद्द करें' : 'Cancel'}
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium px-6 rounded-card shadow-soft tactile-btn disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ minHeight: 48 }}
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span className="text-base">{isHi ? 'सेव हो रहा है…' : 'Saving…'}</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={18} />
              <span className="text-base">
                {submitLabel || (isHi ? 'सेव करें और जारी रखें' : 'Save & continue')}
              </span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default PersonalDetailsForm;
