import React, { useEffect, useRef, useState } from 'react';
import {
  RecaptchaVerifier,
  linkWithPhoneNumber,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { auth } from '../firebase';
import { useFirebase } from '../context/FirebaseContext';
import { useRole } from '../context/RoleContext';
import {
  HeartPulse,
  ShieldCheck,
  User,
  Users,
  Phone,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  IdCard,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import PersonalDetailsForm from '../components/PersonalDetailsForm';

interface OnboardingProps {
  onComplete: () => void;
}

type Step = 'role' | 'details' | 'phone';

const RECAPTCHA_CONTAINER_ID = 'pulse-recaptcha-container';

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const { user } = useFirebase();
  const {
    profile,
    role,
    saveRole,
    savePhoneNumber,
    saveDisplayName,
    savePersonalDetails,
  } = useRole();
  const { language } = useSettings();

  const [step, setStep] = useState<Step>('role');
  const [savingRole, setSavingRole] = useState<null | 'patient' | 'caregiver'>(null);
  const [displayName, setDisplayName] = useState('');

  // Phone fields
  const [phoneDigits, setPhoneDigits] = useState(''); // local 10 digits w/o +91
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [phoneStage, setPhoneStage] = useState<'enter' | 'otp'>('enter');
  const [resendCountdown, setResendCountdown] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // If profile already has a role, skip step 1 — and if the personal
  // details are already filled (returning user with phone still pending),
  // jump straight to phone verification.
  useEffect(() => {
    if (!role) return;
    if (step !== 'role') return;
    const detailsDone = !!profile?.fullName && !!profile?.dateOfBirth;
    setStep(detailsDone ? 'phone' : 'details');
  }, [role, profile?.fullName, profile?.dateOfBirth, step]);

  // If role + details + phone are all set, onboarding is done. Phone is
  // explicitly skippable (handleSkipPhone writes an empty string), so we
  // accept any non-undefined phoneNumber as "step 3 completed".
  useEffect(() => {
    const detailsDone = !!profile?.fullName && !!profile?.dateOfBirth;
    if (role && detailsDone && profile?.phoneNumber !== undefined) {
      onComplete();
    }
  }, [
    role,
    profile?.fullName,
    profile?.dateOfBirth,
    profile?.phoneNumber,
    onComplete,
  ]);

  // Countdown ticking
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setInterval(() => setResendCountdown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCountdown]);

  const cleanupRecaptcha = () => {
    try {
      recaptchaRef.current?.clear();
    } catch {}
    recaptchaRef.current = null;
  };

  useEffect(() => () => cleanupRecaptcha(), []);

  const handleSelectRole = async (chosen: 'patient' | 'caregiver') => {
    setError(null);
    setSavingRole(chosen);
    try {
      if (displayName.trim()) {
        await saveDisplayName(displayName.trim());
      }
      await saveRole(chosen);
      setStep('details');
    } catch (err: any) {
      console.error('saveRole failed', err);
      setError(err?.message || 'Could not save your role. Please try again.');
    } finally {
      setSavingRole(null);
    }
  };

  const handleSaveDetails = async (
    patch: Parameters<typeof savePersonalDetails>[0]
  ) => {
    await savePersonalDetails(patch);
    setStep('phone');
  };

  const fullPhone = `+91${phoneDigits}`;

  const ensureRecaptcha = () => {
    if (recaptchaRef.current) return recaptchaRef.current;
    const verifier = new RecaptchaVerifier(auth, RECAPTCHA_CONTAINER_ID, {
      size: 'invisible',
    });
    recaptchaRef.current = verifier;
    return verifier;
  };

  const handleSendOtp = async () => {
    setError(null);
    setSuccess(null);

    if (!/^\d{10}$/.test(phoneDigits)) {
      setError(
        language === 'hi'
          ? 'कृपया 10 अंकों का सही मोबाइल नंबर डालें।'
          : 'Please enter a valid 10-digit Indian mobile number.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const verifier = ensureRecaptcha();
      let result: ConfirmationResult;
      // Prefer linkWithPhoneNumber so we keep the existing email session;
      // fall back to signInWithPhoneNumber if linking is unavailable.
      try {
        if (auth.currentUser) {
          result = await linkWithPhoneNumber(auth.currentUser, fullPhone, verifier);
        } else {
          result = await signInWithPhoneNumber(auth, fullPhone, verifier);
        }
      } catch (linkErr: any) {
        if (linkErr?.code === 'auth/provider-already-linked') {
          // Phone already linked to this account — verify by re-sending OTP via signIn flow
          result = await signInWithPhoneNumber(auth, fullPhone, verifier);
        } else {
          throw linkErr;
        }
      }
      setConfirmation(result);
      setPhoneStage('otp');
      setResendCountdown(30);
      setSuccess(
        language === 'hi'
          ? `OTP ${fullPhone} पर भेज दिया गया।`
          : `OTP sent to ${fullPhone}.`
      );
    } catch (err: any) {
      console.error('send OTP failed', err);
      cleanupRecaptcha();
      const code = err?.code as string | undefined;
      const map: Record<string, string> = {
        'auth/invalid-phone-number': 'Invalid phone number format.',
        'auth/too-many-requests': 'Too many attempts — try again in a few minutes.',
        'auth/captcha-check-failed': 'reCAPTCHA failed — please reload and retry.',
        'auth/quota-exceeded': 'Daily SMS quota reached for this project.',
        'auth/operation-not-allowed':
          'Phone Auth is not enabled in your Firebase console — enable it under Authentication → Sign-in method.',
        'auth/credential-already-in-use':
          'This phone number is already linked to a different account.',
      };
      setError(map[code || ''] || err?.message || 'Could not send OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    setSuccess(null);
    if (!confirmation) {
      setError('Please request an OTP first.');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError(
        language === 'hi'
          ? '6 अंकों का OTP डालें।'
          : 'Enter the 6-digit OTP code from SMS.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await confirmation.confirm(otp);
      await savePhoneNumber(fullPhone);
      setSuccess(
        language === 'hi' ? 'फ़ोन सत्यापित हो गया!' : 'Phone verified successfully!'
      );
      // Small delay so user sees success state
      setTimeout(() => onComplete(), 600);
    } catch (err: any) {
      console.error('verify OTP failed', err);
      const code = err?.code as string | undefined;
      const map: Record<string, string> = {
        'auth/invalid-verification-code': 'Incorrect OTP — double-check and try again.',
        'auth/code-expired': 'OTP expired — please request a new one.',
      };
      setError(map[code || ''] || err?.message || 'OTP verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipPhone = async () => {
    // Allow skipping if Phone Auth isn't configured, so the demo isn't blocked.
    setSubmitting(true);
    try {
      await savePhoneNumber('');
      onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-navy-950 text-navy-50 flex flex-col">
      {/* Header */}
      <header className="h-[72px] px-5 sm:px-8 flex items-center border-b border-navy-800 bg-navy-900">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-card bg-accent flex items-center justify-center font-medium text-white text-xl shadow-soft">
            ⚡
          </div>
          <div className="leading-tight">
            <div className="text-base font-medium text-navy-50">PULSE</div>
            <div className="text-xs uppercase font-medium tracking-wider text-accent">
              Welcome • Setup
            </div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="hidden sm:flex items-center gap-2 text-sm text-navy-700 font-medium">
          <span className={step === 'role' ? 'text-accent' : 'text-navy-700'}>1. Role</span>
          <span>›</span>
          <span className={step === 'details' ? 'text-accent' : 'text-navy-700'}>2. Details</span>
          <span>›</span>
          <span className={step === 'phone' ? 'text-accent' : 'text-navy-700'}>3. Phone</span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-3xl">
          {/* Progress strip */}
          {(() => {
            const stepIndex = step === 'role' ? 1 : step === 'details' ? 2 : 3;
            const pct = Math.round((stepIndex / 3) * 100);
            return (
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="flex-1 h-2 rounded-full bg-navy-800 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-navy-700 uppercase tracking-wider shrink-0">
                  {language === 'hi'
                    ? `चरण ${stepIndex} / 3`
                    : `Step ${stepIndex} of 3`}
                </span>
              </div>
            );
          })()}

          {/* Status banners */}
          {error && (
            <div className="mb-5 flex items-start gap-3 bg-warning-light border border-warning/40 rounded-card p-4 text-sm text-warning-dark animate-fade-in" role="alert">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-5 flex items-start gap-3 bg-success-light border border-success/40 rounded-card p-4 text-sm text-success-dark animate-fade-in" role="status">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <span className="leading-relaxed">{success}</span>
            </div>
          )}

          {/* ===== STEP 1 — ROLE ===== */}
          {step === 'role' && (
            <div className="space-y-6 animate-slide-up">
              <div className="text-center sm:text-left">
                <h1 className="text-3xl sm:text-4xl font-medium text-navy-50 tracking-tight">
                  {language === 'hi' ? 'PULSE में आपका स्वागत है' : 'Welcome to PULSE'}
                </h1>
                <p className="text-base text-navy-100 mt-3 max-w-xl leading-relaxed">
                  {language === 'hi'
                    ? 'शुरू करने के लिए हमें बताइए कि आप ऐप का उपयोग किस रूप में करेंगे।'
                    : 'To get started, tell us how you will be using PULSE. You can change this later.'}
                </p>
              </div>

              {/* Optional display name */}
              <div className="card-navy">
                <label htmlFor="onboarding-name" className="block text-sm font-medium text-navy-50 mb-2">
                  {language === 'hi' ? 'आपका नाम (वैकल्पिक)' : 'Your Name (optional)'}
                </label>
                <input
                  id="onboarding-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={user?.email?.split('@')[0] || 'How should we address you?'}
                  className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                  style={{ minHeight: 48 }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleSelectRole('patient')}
                  disabled={!!savingRole}
                  className="card-navy text-left hover:border-accent hover:bg-accent/5 transition-colors tactile-btn disabled:opacity-60 disabled:cursor-not-allowed flex flex-col gap-4 group"
                  style={{ minHeight: 240 }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-card bg-accent/10 border border-accent/30 flex items-center justify-center text-accent">
                      <User size={26} />
                    </div>
                    <div>
                      <div className="text-lg font-medium text-navy-50">
                        {language === 'hi' ? 'मैं मरीज़ हूँ' : 'I am a Patient'}
                      </div>
                      <div className="text-xs font-medium uppercase tracking-wider text-accent mt-1">
                        {language === 'hi' ? 'अपनी देखभाल' : 'Self-care'}
                      </div>
                    </div>
                  </div>
                  <p className="text-base text-navy-100 leading-relaxed flex-1">
                    {language === 'hi'
                      ? 'अपनी दवाइयाँ, खुराक और रिपोर्ट्स ट्रैक करें। परिवार के साथ आसानी से साझा करें।'
                      : 'Track your medicines, doses, and health reports. Share access with family or caregivers when needed.'}
                  </p>
                  <div className="flex items-center gap-2 text-accent font-medium text-sm">
                    {savingRole === 'patient' ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <>
                        <span>{language === 'hi' ? 'जारी रखें' : 'Continue'}</span>
                        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('caregiver')}
                  disabled={!!savingRole}
                  className="card-navy text-left hover:border-success hover:bg-success/5 transition-colors tactile-btn disabled:opacity-60 disabled:cursor-not-allowed flex flex-col gap-4 group"
                  style={{ minHeight: 240 }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-card bg-success-light border border-success/30 flex items-center justify-center text-success-dark">
                      <Users size={26} />
                    </div>
                    <div>
                      <div className="text-lg font-medium text-navy-50">
                        {language === 'hi' ? 'मैं केयरगिवर हूँ' : 'I am a Caregiver'}
                      </div>
                      <div className="text-xs font-medium uppercase tracking-wider text-success-dark mt-1">
                        {language === 'hi' ? 'किसी की मदद' : 'Caring for others'}
                      </div>
                    </div>
                  </div>
                  <p className="text-base text-navy-100 leading-relaxed flex-1">
                    {language === 'hi'
                      ? 'परिवार के सदस्यों या मरीज़ों की दवाइयाँ ट्रैक करें। रोज़ाना के एडहेरेंस पर नज़र रखें।'
                      : 'Help loved ones or patients stay on top of their meds. Receive a real-time view of their adherence.'}
                  </p>
                  <div className="flex items-center gap-2 text-success-dark font-medium text-sm">
                    {savingRole === 'caregiver' ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <>
                        <span>{language === 'hi' ? 'जारी रखें' : 'Continue'}</span>
                        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </div>
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-navy-700 pt-2">
                <ShieldCheck size={16} className="text-success-dark" />
                <span>
                  {language === 'hi'
                    ? 'आपकी जानकारी Firebase से एन्क्रिप्टेड है।'
                    : 'Your information is encrypted by Firebase.'}
                </span>
              </div>
            </div>
          )}

          {/* ===== STEP 2 — PERSONAL DETAILS ===== */}
          {step === 'details' && role && (
            <div className="space-y-6 animate-slide-up">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => setStep('role')}
                    className="rounded-card bg-navy-900 border border-navy-800 hover:border-accent text-navy-50 hover:text-accent tactile-btn flex items-center justify-center min-tap"
                    aria-label="Go back to role selection"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-medium text-navy-50 tracking-tight flex items-center gap-2">
                      <IdCard size={24} className="text-accent shrink-0" />
                      <span>
                        {language === 'hi' ? 'अपना विवरण भरें' : 'Tell us about you'}
                      </span>
                    </h1>
                    <p className="text-base text-navy-100 max-w-xl leading-relaxed mt-1.5">
                      {role === 'patient'
                        ? language === 'hi'
                          ? 'यह जानकारी रिपोर्ट, दवा सलाह और आपात स्थिति में काम आती है। आप बाद में बदल सकते हैं।'
                          : 'These details power your reports, dose suggestions, and emergency contacts. You can edit them later.'
                        : language === 'hi'
                        ? 'मरीज़ की रिपोर्ट और SOS में आपका नाम और संपर्क दिखाने के लिए ज़रूरी है।'
                        : 'We use these so your linked patient (and any emergency responder) knows who you are.'}
                    </p>
                  </div>
                </div>
              </div>

              <PersonalDetailsForm
                role={role}
                initial={{
                  fullName: profile?.fullName || displayName || '',
                  dateOfBirth: profile?.dateOfBirth,
                  gender: profile?.gender,
                  bloodGroup: profile?.bloodGroup,
                  heightCm: profile?.heightCm,
                  weightKg: profile?.weightKg,
                  allergies: profile?.allergies,
                  conditions: profile?.conditions,
                  conditionsNotes: profile?.conditionsNotes,
                  emergencyContact: profile?.emergencyContact,
                }}
                submitLabel={
                  language === 'hi' ? 'सेव करें और जारी रखें' : 'Save & continue'
                }
                onSubmit={handleSaveDetails}
              />
            </div>
          )}

          {/* ===== STEP 3 — PHONE ===== */}
          {step === 'phone' && (
            <div className="space-y-6 animate-slide-up">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => setStep('details')}
                    className="rounded-card bg-navy-900 border border-navy-800 hover:border-accent text-navy-50 hover:text-accent tactile-btn flex items-center justify-center min-tap"
                    aria-label="Go back to personal details"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <h1 className="text-2xl sm:text-3xl font-medium text-navy-50 tracking-tight">
                    {language === 'hi' ? 'फ़ोन सत्यापित करें' : 'Verify your phone'}
                  </h1>
                </div>
                <p className="text-base text-navy-100 max-w-xl leading-relaxed">
                  {language === 'hi'
                    ? 'दवाई के समय पर रिमाइंडर भेजने और सुरक्षा के लिए हमें आपका मोबाइल नंबर चाहिए।'
                    : 'We use your phone to send dose reminders and to keep your account secure. We will never share it.'}
                </p>
              </div>

              <div className="card-navy max-w-xl">
                {phoneStage === 'enter' && (
                  <div className="space-y-5">
                    <label htmlFor="onboarding-phone" className="block text-sm font-medium text-navy-50">
                      {language === 'hi' ? 'मोबाइल नंबर' : 'Mobile Number'}
                    </label>
                    <div className="flex items-stretch gap-2">
                      <div
                        className="flex items-center gap-1.5 bg-navy-950 border border-navy-800 rounded-card px-4 text-base font-medium text-navy-50"
                        style={{ minHeight: 48 }}
                      >
                        <Phone size={16} className="text-accent" />
                        <span>+91</span>
                      </div>
                      <input
                        id="onboarding-phone"
                        type="tel"
                        inputMode="numeric"
                        value={phoneDigits}
                        onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="98765 43210"
                        autoComplete="tel-national"
                        className="flex-1 bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 placeholder:text-navy-700 tracking-wider outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 font-mono transition-all"
                        style={{ minHeight: 48 }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={submitting || phoneDigits.length !== 10}
                      className="w-full inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium rounded-card shadow-soft tactile-btn disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ minHeight: 48 }}
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span className="text-base">
                            {language === 'hi' ? 'OTP भेज रहे हैं…' : 'Sending OTP…'}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-base">{language === 'hi' ? 'OTP भेजें' : 'Send OTP'}</span>
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipPhone}
                      disabled={submitting}
                      className="w-full text-sm font-medium text-navy-700 hover:text-accent tactile-btn"
                      style={{ minHeight: 48 }}
                    >
                      {language === 'hi' ? 'अभी छोड़ें — बाद में जोड़ें' : 'Skip for now — I will add it later'}
                    </button>
                  </div>
                )}

                {phoneStage === 'otp' && (
                  <div className="space-y-5 animate-fade-in">
                    <div>
                      <div className="text-sm font-medium text-navy-50">
                        {language === 'hi' ? 'OTP डालें' : 'Enter OTP'}
                      </div>
                      <div className="text-sm text-navy-700 mt-1">
                        {language === 'hi'
                          ? `${fullPhone} पर भेजा गया`
                          : `Sent to ${fullPhone}`}
                        <button
                          onClick={() => {
                            setPhoneStage('enter');
                            setOtp('');
                            setConfirmation(null);
                          }}
                          className="ml-2 text-accent hover:text-accent-dark font-medium tactile-btn"
                        >
                          {language === 'hi' ? 'बदलें' : 'Change'}
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      maxLength={6}
                      autoComplete="one-time-code"
                      aria-label="One-time password code"
                      className="w-full bg-navy-950 border border-navy-800 rounded-card py-3 px-4 text-2xl text-center text-navy-50 tracking-[0.5em] font-mono outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                      style={{ minHeight: 60 }}
                    />
                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      disabled={submitting || otp.length !== 6}
                      className="w-full inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium rounded-card shadow-soft tactile-btn disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ minHeight: 48 }}
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span className="text-base">{language === 'hi' ? 'सत्यापित कर रहे हैं…' : 'Verifying…'}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={18} />
                          <span className="text-base">{language === 'hi' ? 'OTP सत्यापित करें' : 'Verify OTP'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={submitting || resendCountdown > 0}
                      className="w-full text-sm font-medium text-navy-700 hover:text-accent tactile-btn disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ minHeight: 48 }}
                    >
                      {resendCountdown > 0
                        ? language === 'hi'
                          ? `OTP दोबारा भेजें (${resendCountdown}s)`
                          : `Resend OTP in ${resendCountdown}s`
                        : language === 'hi'
                        ? 'OTP दोबारा भेजें'
                        : 'Resend OTP'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 text-sm text-navy-700 max-w-xl">
                <HeartPulse size={18} className="text-accent mt-0.5 shrink-0" />
                <span className="leading-relaxed">
                  {language === 'hi'
                    ? 'PULSE आपका नंबर सिर्फ़ रिमाइंडर और सुरक्षा के लिए उपयोग करता है। हम कभी मार्केटिंग SMS नहीं भेजते।'
                    : 'PULSE only uses your number for reminders and account security. We never send marketing SMS.'}
                </span>
              </div>
            </div>
          )}

          {/* Invisible reCAPTCHA mount point */}
          <div id={RECAPTCHA_CONTAINER_ID} />
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
