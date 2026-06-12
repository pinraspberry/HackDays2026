import { useState } from 'react';
import { loginUser, registerUser } from '../services/authService';
import { useSettings } from '../context/SettingsContext';
import type { LanguageCode } from '../context/SettingsContext';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Pill,
  FileText,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

type Mode = 'login' | 'register';

const friendlyError = (code: string | undefined, fallback: string): string => {
  if (!code) return fallback;
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password — please try again.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Password is too weak — use at least 6 characters.',
    'auth/network-request-failed': 'Network issue — check your connection.',
    'auth/too-many-requests': 'Too many attempts — please wait a minute.',
  };
  return map[code] || fallback;
};

export default function Login() {
  const { language, setLanguage } = useSettings();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isLogin = mode === 'login';

  const tagline =
    language === 'hi'
      ? 'आपका साथी, हर खुराक पर'
      : language === 'ta'
      ? 'ஒவ்வொரு டோசிலும் உங்கள் துணை'
      : 'Your companion, every dose of the way';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    if (mode === 'register') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await loginUser(email, password);
      } else {
        const res = await registerUser(email, password);
        console.log('REGISTER SUCCESS:', res.user.email);
        setSuccess('Account created — signing you in…');
      }
    } catch (err: any) {
      console.log('AUTH ERROR:', err?.code, err);
      setError(friendlyError(err?.code, err?.message || 'Authentication failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuccess(null);
    setConfirmPassword('');
  };

  const featureBullets = [
    {
      icon: Pill,
      title: language === 'hi' ? 'स्मार्ट दवाई ट्रैकिंग' : 'Smart medicine tracking',
      desc:
        language === 'hi'
          ? 'सुबह से रात तक हर खुराक स्वतः लॉग करें।'
          : 'Log every dose from morning to night, automatically.',
    },
    {
      icon: FileText,
      title: language === 'hi' ? 'दस्तावेज़ AI' : 'Document AI',
      desc:
        language === 'hi'
          ? 'पर्चे और रिपोर्ट्स से सीधे सवाल पूछें।'
          : 'Ask questions about your prescriptions and lab reports.',
    },
    {
      icon: Sparkles,
      title: language === 'hi' ? '9 भारतीय भाषाएँ' : '9 Indian languages',
      desc:
        language === 'hi'
          ? 'हिंदी, तमिल, गुजराती और बहुत कुछ — आपकी भाषा में।'
          : 'Hindi, Tamil, Gujarati and more — in your language.',
    },
  ];

  return (
    <div className="min-h-screen w-full bg-navy-950 text-navy-50 flex flex-col lg:flex-row">
      {/* ===== Hero / Branding panel — desktop only ===== */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/5 relative overflow-hidden border-r border-navy-800 bg-accent-dark text-white">
        {/* Soft, calm accents — no harsh neon glow */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-accent/30 rounded-full blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -right-20 w-96 h-96 bg-accent-light/20 rounded-full blur-3xl" aria-hidden="true" />

        <div className="relative z-10 p-12 flex flex-col w-full">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-card bg-white/15 backdrop-blur-sm flex items-center justify-center font-medium text-white text-2xl">
              ⚡
            </div>
            <div className="leading-tight">
              <h1 className="text-2xl font-medium text-white tracking-tight">
                {language === 'hi' ? 'पल्स (PULSE)' : 'PULSE'}
              </h1>
              <span className="text-xs font-medium text-accent-light uppercase tracking-wider">
                Medication Tracker
              </span>
            </div>
          </div>

          {/* Hero copy */}
          <div className="mt-16">
            <h2 className="text-4xl xl:text-5xl font-medium text-white leading-tight tracking-tight">
              {tagline}
            </h2>
            <p className="text-white/85 text-base mt-5 leading-relaxed max-w-md">
              {language === 'hi'
                ? 'PULSE आपकी दवाइयों, पर्चों और स्वास्थ्य रिपोर्ट्स को एक सुरक्षित, बहुभाषी डैशबोर्ड में लाता है — परिवार के लिए डिज़ाइन किया गया।'
                : 'PULSE brings your medicines, prescriptions, and health reports into one secure, multilingual dashboard — designed for the whole family.'}
            </p>
          </div>

          {/* Feature bullets */}
          <div className="mt-12 space-y-4">
            {featureBullets.map(({ icon: Icon, title, desc }, idx) => (
              <div
                key={idx}
                className="flex items-start gap-4 p-5 bg-white/10 border border-white/15 rounded-card backdrop-blur-sm hover:border-white/30 transition-colors"
              >
                <div className="w-12 h-12 rounded-card bg-white/15 flex items-center justify-center text-white shrink-0">
                  <Icon size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-medium text-white">{title}</div>
                  <div className="text-sm text-white/80 mt-1 leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer trust badge */}
          <div className="mt-auto pt-12 flex items-center gap-2 text-sm text-white/80">
            <ShieldCheck size={18} className="text-success-light" />
            <span className="font-medium">
              {language === 'hi'
                ? 'Firebase से एन्क्रिप्टेड • भारत में बनाया गया'
                : 'Encrypted by Firebase • Made in India'}
            </span>
          </div>
        </div>
      </div>

      {/* ===== Form panel ===== */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative bg-navy-950">
        {/* Top-right language selector — visible on all sizes */}
        <div className="absolute top-5 right-5 sm:top-6 sm:right-6">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageCode)}
            aria-label="Select language"
            className="bg-navy-900 text-navy-50 font-medium text-sm px-4 rounded-card border border-navy-800 outline-none cursor-pointer hover:border-accent focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
            style={{ minHeight: 48 }}
          >
            <option value="hi">हिंदी</option>
            <option value="ta">தமிழ்</option>
            <option value="gu">ગુજરાતી</option>
            <option value="mr">मराठी</option>
            <option value="te">తెలుగు</option>
            <option value="bn">বাংলা</option>
            <option value="kn">ಕನ್ನಡ</option>
            <option value="ml">മലയാളം</option>
            <option value="en">EN</option>
          </select>
        </div>

        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-card bg-accent flex items-center justify-center font-medium text-white text-xl shadow-soft">
              ⚡
            </div>
            <div className="leading-tight">
              <h1 className="text-xl font-medium text-navy-50 tracking-tight">
                {language === 'hi' ? 'पल्स (PULSE)' : 'PULSE'}
              </h1>
              <span className="text-xs font-medium text-accent uppercase tracking-wider">
                Medication Tracker
              </span>
            </div>
          </div>

          {/* Auth card */}
          <div className="card-navy">
            {/* Mode toggle */}
            <div className="flex p-1.5 bg-navy-950 border border-navy-800 rounded-card mb-6">
              <button
                type="button"
                onClick={() => switchMode('login')}
                aria-pressed={isLogin}
                className={`flex-1 text-sm font-medium rounded-md transition-colors tactile-btn ${
                  isLogin ? 'bg-accent text-white shadow-soft' : 'text-navy-100 hover:text-accent-dark'
                }`}
                style={{ minHeight: 44 }}
              >
                {language === 'hi' ? 'लॉग इन' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                aria-pressed={!isLogin}
                className={`flex-1 text-sm font-medium rounded-md transition-colors tactile-btn ${
                  !isLogin ? 'bg-accent text-white shadow-soft' : 'text-navy-100 hover:text-accent-dark'
                }`}
                style={{ minHeight: 44 }}
              >
                {language === 'hi' ? 'रजिस्टर' : 'Create Account'}
              </button>
            </div>

            {/* Heading */}
            <h2 className="text-2xl font-medium text-navy-50 tracking-tight">
              {isLogin
                ? language === 'hi'
                  ? 'वापसी पर स्वागत है'
                  : 'Welcome back'
                : language === 'hi'
                ? 'अपना अकाउंट बनाएँ'
                : 'Create your account'}
            </h2>
            <p className="text-base text-navy-700 mt-2 mb-6">
              {isLogin
                ? language === 'hi'
                  ? 'अपनी दवाइयाँ और स्वास्थ्य रिकॉर्ड एक्सेस करें।'
                  : 'Access your medications and health records.'
                : language === 'hi'
                ? 'मिनट भर में शुरू करें — कोई क्रेडिट कार्ड नहीं।'
                : 'Get started in under a minute — no credit card.'}
            </p>

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

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-navy-50 mb-2">
                  {language === 'hi' ? 'ईमेल' : 'Email'}
                </label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-700"
                    aria-hidden="true"
                  />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-navy-950 border border-navy-800 rounded-card pl-12 pr-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                    style={{ minHeight: 48 }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="login-password" className="block text-sm font-medium text-navy-50">
                    {language === 'hi' ? 'पासवर्ड' : 'Password'}
                  </label>
                  {isLogin && (
                    <button
                      type="button"
                      className="text-sm font-medium text-accent hover:text-accent-dark tactile-btn"
                      style={{ minHeight: 36, paddingInline: 4 }}
                      onClick={() =>
                        setError(
                          language === 'hi'
                            ? 'पासवर्ड रीसेट के लिए अपनी ईमेल जाँच करें।'
                            : 'Password reset coming soon — please contact support.'
                        )
                      }
                    >
                      {language === 'hi' ? 'भूल गए?' : 'Forgot?'}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-700"
                    aria-hidden="true"
                  />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-navy-950 border border-navy-800 rounded-card pl-12 pr-12 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                    style={{ minHeight: 48 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-700 hover:text-accent tactile-btn flex items-center justify-center w-10 h-10 rounded-card"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {!isLogin && (
                  <div className="mt-2 text-sm text-navy-700">
                    {language === 'hi'
                      ? 'कम से कम 6 अक्षर होने चाहिए'
                      : 'Use at least 6 characters'}
                  </div>
                )}
              </div>

              {/* Confirm password (register only) */}
              {!isLogin && (
                <div className="animate-slide-up">
                  <label htmlFor="login-confirm" className="block text-sm font-medium text-navy-50 mb-2">
                    {language === 'hi' ? 'पासवर्ड पुष्टि करें' : 'Confirm Password'}
                  </label>
                  <div className="relative">
                    <Lock
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-700"
                      aria-hidden="true"
                    />
                    <input
                      id="login-confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-navy-950 border border-navy-800 rounded-card pl-12 pr-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                      style={{ minHeight: 48 }}
                    />
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium rounded-card shadow-soft tactile-btn disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ minHeight: 52 }}
              >
                {submitting ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    <span className="text-base">
                      {isLogin
                        ? language === 'hi'
                          ? 'साइन इन हो रहा है…'
                          : 'Signing you in…'
                        : language === 'hi'
                        ? 'अकाउंट बना रहे हैं…'
                        : 'Creating account…'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-base">
                      {isLogin
                        ? language === 'hi'
                          ? 'लॉग इन करें'
                          : 'Sign In'
                        : language === 'hi'
                        ? 'अकाउंट बनाएँ'
                        : 'Create Account'}
                    </span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            {/* Mode swap CTA */}
            <div className="text-center mt-6 pt-5 border-t border-navy-800">
              <span className="text-sm text-navy-700">
                {isLogin
                  ? language === 'hi'
                    ? 'अकाउंट नहीं है? '
                    : "Don't have an account? "
                  : language === 'hi'
                  ? 'पहले से अकाउंट है? '
                  : 'Already have an account? '}
              </span>
              <button
                type="button"
                onClick={() => switchMode(isLogin ? 'register' : 'login')}
                className="text-sm font-medium text-accent hover:text-accent-dark tactile-btn"
                style={{ minHeight: 36, paddingInline: 4 }}
              >
                {isLogin
                  ? language === 'hi'
                    ? 'नया अकाउंट बनाएँ →'
                    : 'Create one →'
                  : language === 'hi'
                  ? 'साइन इन करें →'
                  : 'Sign in instead →'}
              </button>
            </div>
          </div>

          {/* Tiny legal */}
          <p className="text-xs text-navy-700 text-center mt-6 leading-relaxed">
            {language === 'hi'
              ? 'जारी रखकर, आप PULSE की उपयोग की शर्तें और गोपनीयता नीति स्वीकार करते हैं।'
              : 'By continuing, you agree to PULSE’s Terms of Use and Privacy Policy.'}
          </p>
        </div>
      </div>
    </div>
  );
}
