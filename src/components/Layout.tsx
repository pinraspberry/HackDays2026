// PULSE — modified
import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Pill,
  FileText,
  Sparkles,
  Mic,
  Settings,
  X,
  Volume2,
  Menu,
  LogOut,
  User as UserIcon,
  Users,
  Link as LinkIcon,
  ChevronLeft,
  MapPin,
  CalendarCheck,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import type { LanguageCode } from '../context/SettingsContext';
import { useMedication } from '../context/MedicationContext';
import { useFirebase } from '../context/FirebaseContext';
import { useRole } from '../context/RoleContext';
import { useSOS } from '../context/SOSContext';
import { SarvamService } from '../services/sarvamService';
import { auth } from '../firebase';
import { PatientSwitcher } from './PatientSwitcher';
import { SOSAlertBanner } from './SOSAlertBanner';
import { AccessibilitySettings } from './AccessibilitySettings';

interface LayoutProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: string;
  label: string;
  nativeLabel?: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

export const Layout: React.FC<LayoutProps> = ({ activeTab, setActiveTab, children }) => {
  const {
    language,
    setLanguage,
    t,
  } = useSettings();
  const { addMedication } = useMedication();
  const { user } = useFirebase();
  const { role, profile, activePatientId, activePatientName, setActivePatientId } = useRole();
  // PULSE — modified: caregiver navigation pings off the same context
  // the SOSAlertBanner reads from, so there's never a duplicate query.
  const { unacknowledgedCount } = useSOS();

  // Drawer / dialog states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechText, setSpeechText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // mobile only
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isPatientSwitcherOpen, setIsPatientSwitcherOpen] = useState(false);

  // Web Speech recognition variables
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (Speech) {
      const rec = new Speech();
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setIsListening(true);
        setSpeechText('');
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSpeechText(transcript);
        handleSpeechCompletion(transcript);
        console.log('VOICE RECEIVED:', transcript);
      };

      rec.onerror = (e: any) => {
        console.error('Speech Recognition Error:', e);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      setRecognition(rec);
    }
  }, [language]);

  const toggleMic = () => {
    if (isMicOpen) {
      if (recognition) recognition.stop();
      setIsMicOpen(false);
    } else {
      setIsMicOpen(true);
      setSpeechText(t.micListening);
      setTimeout(() => {
        startSpeechListening();
      }, 500);
    }
  };

  const startSpeechListening = () => {
    if (recognition) {
      const langMap: Record<LanguageCode, string> = {
        hi: 'hi-IN', ta: 'ta-IN', gu: 'gu-IN', mr: 'mr-IN',
        te: 'te-IN', bn: 'bn-IN', kn: 'kn-IN', ml: 'ml-IN', en: 'en-IN'
      };
      recognition.lang = langMap[language] || 'hi-IN';
      try {
        recognition.start();
      } catch (err) {
        console.warn('Recognition already active', err);
      }
    } else {
      setIsListening(true);
      setTimeout(() => {
        setIsListening(false);
        const sim =
          language === 'hi'
            ? 'सुबह खाने के बाद एक गोली एस्पिरिन देना'
            : 'Take one tablet of Aspirin in the morning after breakfast';
        setSpeechText(sim);
        handleSpeechCompletion(sim);
      }, 2000);
    }
  };

  const handleSpeechCompletion = async (text: string) => {
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Voice queries on the assistant page route directly into the chat input.
    if (activeTab === 'assistant') {
      window.dispatchEvent(new CustomEvent('pulse_voice_chat', { detail: text }));
      setIsMicOpen(false);
      return;
    }

    console.log('CALLING SARVAM AI...');
    const parsedMed = await SarvamService.extractMedicationFromText(text);
    if (!parsedMed?.name) {
      alert('Could not identify medication name');
      return;
    }
    console.log('SARVAM RAW:', parsedMed);
    parsedMed.timing = Array.isArray(parsedMed.timing) ? parsedMed.timing : ['morning'];
    parsedMed.instructions = parsedMed.instructions || 'After meals';
    parsedMed.frequency = parsedMed.frequency || 'Once Daily';
    parsedMed.dosage = parsedMed.dosage || '1 Tablet';

    await addMedication(parsedMed);
    console.log('AI Medication:', parsedMed);

    const successSpeech: Record<LanguageCode, string> = {
      hi: `${parsedMed.name} दवाई सुरक्षित कर ली गई है।`,
      ta: `${parsedMed.name} மருந்து வெற்றிகரமாக சேர்க்கப்பட்டது.`,
      gu: `${parsedMed.name} દવા ઉમેરી દેવામાં આવી છે.`,
      mr: `${parsedMed.name} औषध जतन केले आहे.`,
      te: `${parsedMed.name} మందును జోడించడం జరిగింది.`,
      bn: `${parsedMed.name} ওষুধ সংরক্ষণ করা হয়েছে।`,
      kn: `${parsedMed.name} ಔಷಧಿ ಸೇರಿಸಲಾಗಿದೆ.`,
      ml: `${parsedMed.name} മരുന്ന് വിജയകരമായി ചേർത്തു.`,
      en: `${parsedMed.name} medication added successfully.`,
    };

    await SarvamService.textToSpeech(successSpeech[language] || successSpeech['hi'], language);

    setActiveTab('medicines');
    setIsMicOpen(false);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error('LOGOUT FAILED:', err);
    } finally {
      setProfileMenuOpen(false);
    }
  };

  // Alt+A opens accessibility settings (keyboard-only users)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Localised sidebar labels (kept short for the 240px column)
  const navLabels: Record<string, { en: string; native?: string }> = {
    home:           { en: 'Dashboard', native: language === 'hi' ? 'डैशबोर्ड' : undefined },
    medicines:      { en: 'Medicines', native: language === 'hi' ? 'दवाइयाँ' : t.medicinesTab },
    documents:      { en: 'Prescriptions', native: language === 'hi' ? 'पर्चे और रिपोर्ट्स' : t.documentsTab },
    appointments:   { en: 'Appointments', native: language === 'hi' ? 'अपॉइंटमेंट' : language === 'ta' ? 'சந்திப்புகள்' : undefined },
    nearby:         { en: 'Nearby Care', native: language === 'hi' ? 'पास की देखभाल' : language === 'ta' ? 'அருகிலுள்ள கவனிப்பு' : undefined },
    assistant:      { en: 'AI Assistant', native: language === 'hi' ? 'सहायक' : undefined },
    'caregiver-link': { en: 'Link Caregiver', native: language === 'hi' ? 'केयरगिवर लिंक' : undefined },
  };

  const baseNavItems: NavItem[] = [
    { id: 'home',      label: navLabels.home.en,      nativeLabel: navLabels.home.native,      icon: LayoutDashboard },
    { id: 'medicines', label: navLabels.medicines.en, nativeLabel: navLabels.medicines.native, icon: Pill },
    { id: 'documents', label: navLabels.documents.en, nativeLabel: navLabels.documents.native, icon: FileText },
    { id: 'appointments', label: navLabels.appointments.en, nativeLabel: navLabels.appointments.native, icon: CalendarCheck },
    { id: 'nearby',    label: navLabels.nearby.en,    nativeLabel: navLabels.nearby.native,    icon: MapPin },
    { id: 'assistant', label: navLabels.assistant.en, nativeLabel: navLabels.assistant.native, icon: Sparkles },
  ];

  // Patients get an extra "Link Caregiver" tab. Caregivers don't see it
  // (RoleGuard would also redirect them away if they tried to navigate to it).
  const navItems: NavItem[] =
    role === 'patient'
      ? [
          ...baseNavItems,
          {
            id: 'caregiver-link',
            label: navLabels['caregiver-link'].en,
            nativeLabel: navLabels['caregiver-link'].native,
            icon: LinkIcon,
          },
        ]
      : baseNavItems;

  // Prefer the personalised name captured during onboarding for both
  // the avatar initial and the dropdown header. We fall back through
  // the legacy displayName and email so older accounts still get a
  // sensible label until they edit their profile.
  const profileName = profile?.fullName || profile?.displayName || '';
  const userInitial = (profileName || user?.email || 'U').charAt(0).toUpperCase();

  // PULSE — modified: caregiver-only red ping rendered on the
  // dashboard nav item whenever there is an unacknowledged SOS event.
  // Drives off `unacknowledgedCount` from SOSContext (one shared
  // listener). aria-live polite so screen readers re-announce the
  // count change without interrupting the user mid-action.
  const showSOSDot = role === 'caregiver' && unacknowledgedCount > 0;
  const renderNavIcon = (
    Icon: React.ComponentType<{ size?: number | string; className?: string }>,
    iconClass: string,
    isHomeTab: boolean
  ) => (
    <span className="relative inline-flex shrink-0">
      <Icon size={20} className={iconClass} />
      {isHomeTab && showSOSDot && (
        <span
          aria-label="Unacknowledged SOS alerts"
          aria-live="polite"
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 border-2 border-navy-900 shadow-soft"
        />
      )}
    </span>
  );

  return (
    <div className="min-h-screen w-full bg-navy-950 text-navy-50 flex flex-col">
      {/* ===== TOP NAVBAR ===== */}
      <header className="sticky top-0 z-40 h-[72px] bg-navy-900/95 backdrop-blur border-b border-navy-800 flex items-center px-4 lg:px-8">
        {/* Caregiver hamburger — opens linked patients drawer */}
        {role === 'caregiver' && (
          <button
            onClick={() => setIsPatientSwitcherOpen(true)}
            className="mr-3 text-navy-50 hover:text-accent bg-navy-850 hover:bg-accent/10 rounded-card border border-navy-800 hover:border-accent tactile-btn relative flex items-center justify-center min-tap"
            aria-label="Open linked patients"
          >
            <Users size={20} />
            {activePatientId && (
              <span
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-success border-2 border-navy-900"
                aria-hidden="true"
              />
            )}
          </button>
        )}

        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden mr-3 text-navy-50 hover:text-accent bg-navy-850 hover:bg-accent/10 rounded-card border border-navy-800 hover:border-accent tactile-btn flex items-center justify-center min-tap"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Brand */}
        <div className="flex items-center space-x-2.5">
          <div className="w-11 h-11 rounded-card bg-accent flex items-center justify-center font-medium text-white text-lg shadow-soft">
            ⚡
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-medium text-navy-50 tracking-tight">{t.appName}</h1>
            <span className="hidden sm:block text-xs font-medium text-navy-700 uppercase tracking-wider">
              Medication Tracker
            </span>
          </div>
        </div>

        <div className="flex-1" />

        {/* Right cluster: language, settings, profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageCode)}
            aria-label="Select language"
            className="bg-navy-850 text-navy-50 font-medium text-sm px-3 rounded-card border border-navy-800 outline-none cursor-pointer hover:border-accent focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
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

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-navy-50 hover:text-accent bg-navy-850 hover:bg-accent/10 rounded-card border border-navy-800 hover:border-accent tactile-btn flex items-center gap-2 px-3 min-tap"
            aria-label="Open accessibility and theme settings"
            title="Accessibility & Theme settings (Alt+A)"
          >
            <Settings size={22} />
            <span className="hidden md:inline text-sm font-medium">Settings</span>
          </button>

          {/* Profile avatar */}
          <div className="relative">
            <button
              onClick={() => setProfileMenuOpen(p => !p)}
              className="w-11 h-11 rounded-full bg-accent text-white font-medium text-sm flex items-center justify-center shadow-soft hover:bg-accent-dark transition-colors tactile-btn"
              aria-label="Profile"
            >
              {userInitial}
            </button>

            {profileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div className="absolute right-0 top-14 w-72 bg-navy-900 border border-navy-800 rounded-card shadow-lifted z-40 p-3 animate-slide-up">
                  <div className="px-3 py-3 border-b border-navy-800 mb-2">
                    <div className="text-xs font-medium text-navy-700 uppercase tracking-wider">
                      Signed in as
                    </div>
                    {profileName && (
                      <div className="text-sm font-medium text-navy-50 truncate flex items-center gap-2 mt-1">
                        <UserIcon size={16} className="text-navy-700" />
                        {profileName}
                      </div>
                    )}
                    <div
                      className={`text-xs text-navy-700 truncate ${
                        profileName ? 'mt-0.5 pl-6' : 'flex items-center gap-2 mt-1'
                      }`}
                    >
                      {!profileName && <UserIcon size={16} className="text-navy-700" />}
                      {user?.email || 'Guest'}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setActiveTab('profile');
                    }}
                    className="w-full flex items-center gap-3 px-3 text-sm font-medium text-navy-50 hover:bg-navy-850 rounded-card text-left tactile-btn"
                    style={{ minHeight: 48 }}
                  >
                    <UserIcon size={18} className="text-accent" />
                    <span>{language === 'hi' ? 'मेरी प्रोफ़ाइल' : 'My Profile'}</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 text-sm font-medium text-danger hover:bg-danger-light rounded-card text-left tactile-btn"
                    style={{ minHeight: 48 }}
                  >
                    <LogOut size={18} />
                    <span>Sign out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ===== Caregiver "Viewing patient X" banner ===== */}
      {role === 'caregiver' && activePatientId && (
        <div className="sticky top-[72px] z-30 bg-success-light border-b border-success/30 px-4 lg:px-8 py-3 flex items-center gap-3">
          <button
            onClick={() => setIsPatientSwitcherOpen(true)}
            className="inline-flex items-center gap-2 text-success-dark hover:text-success tactile-btn"
            style={{ minHeight: 48, paddingInline: 8 }}
            aria-label="Switch patient"
          >
            <ChevronLeft size={18} />
            <Users size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-wider text-success-dark">
              {language === 'hi' ? 'देख रहे हैं' : 'Viewing'}
            </span>
            <span className="ml-2 text-sm font-medium text-navy-50 truncate">
              {activePatientName || 'Linked patient'}
            </span>
          </div>
          <button
            onClick={() => setActivePatientId(null)}
            className="inline-flex items-center gap-2 text-sm font-medium text-success-dark bg-success-light hover:bg-success/15 border border-success/40 rounded-card px-4 tactile-btn"
            style={{ minHeight: 48 }}
            aria-label="Exit patient view"
          >
            <X size={16} />
            <span className="hidden sm:inline">{language === 'hi' ? 'बाहर निकलें' : 'Exit'}</span>
          </button>
        </div>
      )}

      {/* ===== Caregiver SOS banner (self-gates by role + active alerts) ===== */}
      <SOSAlertBanner
        onJumpToHistory={() => {
          setActiveTab('home');
          // Defer until after the home tab mounts so the section anchor
          // exists; the history feed sets id="sos-history".
          setTimeout(() => {
            const el = document.getElementById('sos-history');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }}
      />

      {/* ===== Caregiver patient switcher drawer ===== */}
      <PatientSwitcher
        open={isPatientSwitcherOpen}
        onClose={() => setIsPatientSwitcherOpen(false)}
      />

      {/* ===== BODY: SIDEBAR + MAIN ===== */}
      <div className="flex-1 flex">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-navy-800 bg-navy-900 sticky top-[72px] h-[calc(100vh-72px)]">
          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto thin-scroll">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 pl-4 pr-3 py-3 rounded-card text-left transition-colors border-l-[3px] ${
                    active
                      ? 'bg-accent/8 border-l-accent text-accent-dark'
                      : 'border-l-transparent text-navy-50 hover:bg-navy-850 hover:text-accent-dark'
                  }`}
                  style={{ minHeight: 48 }}
                >
                  {renderNavIcon(
                    Icon,
                    active ? 'text-accent' : 'text-navy-700',
                    item.id === 'home'
                  )}
                  <span className="flex flex-col leading-tight">
                    <span className={`text-sm ${active ? 'font-medium' : 'font-medium'}`}>{item.label}</span>
                    {item.nativeLabel && item.nativeLabel !== item.label && (
                      <span className="text-xs text-navy-700 font-medium mt-0.5">{item.nativeLabel}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Voice mic CTA in the sidebar footer */}
          <div className="p-4 border-t border-navy-800">
            <button
              onClick={toggleMic}
              className="w-full flex items-center justify-center gap-3 bg-accent hover:bg-accent-dark text-white font-medium rounded-card shadow-lifted tactile-btn voice-halo"
              style={{ minHeight: 64 }}
              aria-label={language === 'hi' ? 'आवाज से दवा जोड़ें' : 'Add medicine by voice'}
            >
              <Mic size={26} />
              <span className="text-base">
                {language === 'hi' ? 'आवाज से जोड़ें' : 'Voice Add'}
              </span>
            </button>
            <p className="text-sm text-navy-700 text-center mt-3 leading-relaxed">
              {language === 'hi'
                ? 'दवा का नाम बोलिए, हम जोड़ देंगे'
                : 'Speak the medicine name and we will add it for you'}
            </p>
          </div>
        </aside>

        {/* Sidebar — mobile drawer */}
        {isSidebarOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-navy-50/40 backdrop-blur-sm z-40 animate-fade-in"
              onClick={() => setIsSidebarOpen(false)}
            />
            <aside className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-navy-900 border-r border-navy-800 z-50 flex flex-col animate-slide-left shadow-lifted">
              <div className="h-16 px-4 flex items-center justify-between border-b border-navy-800">
                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 rounded-card bg-accent flex items-center justify-center font-medium text-white">⚡</div>
                  <span className="font-medium text-navy-50 text-base">{t.appName}</span>
                </div>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="text-navy-50 hover:text-accent bg-navy-850 hover:bg-accent/10 rounded-card border border-navy-800 tactile-btn flex items-center justify-center min-tap"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto thin-scroll">
                {navItems.map(item => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsSidebarOpen(false);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 pl-4 pr-3 py-3 rounded-card text-left transition-colors border-l-[3px] ${
                        active
                          ? 'bg-accent/8 border-l-accent text-accent-dark'
                          : 'border-l-transparent text-navy-50 hover:bg-navy-850'
                      }`}
                      style={{ minHeight: 48 }}
                    >
                      {renderNavIcon(
                        Icon,
                        active ? 'text-accent' : 'text-navy-700',
                        item.id === 'home'
                      )}
                      <span className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">{item.label}</span>
                        {item.nativeLabel && item.nativeLabel !== item.label && (
                          <span className="text-xs text-navy-700 font-medium mt-0.5">{item.nativeLabel}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-navy-800">
                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    toggleMic();
                  }}
                  className="w-full flex items-center justify-center gap-3 bg-accent hover:bg-accent-dark text-white font-medium rounded-card shadow-lifted tactile-btn voice-halo"
                  style={{ minHeight: 64 }}
                  aria-label={language === 'hi' ? 'आवाज से दवा जोड़ें' : 'Add medicine by voice'}
                >
                  <Mic size={26} />
                  <span className="text-base">
                    {language === 'hi' ? 'आवाज से जोड़ें' : 'Voice Add'}
                  </span>
                </button>
              </div>
            </aside>
          </>
        )}

        {/* Main content area */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>

      {/* Floating Voice Add FAB — sticks to viewport on mobile / tablet.
          Sized 80px diameter (spec: 72–80px), pulsing halo so it's
          unmissable, paired with a text label below for clarity. Placed
          bottom-left so it never collides with the SOS FAB. */}
      <div className="lg:hidden fixed bottom-6 left-6 z-30 flex flex-col items-center select-none pointer-events-none">
        <button
          onClick={toggleMic}
          className="w-20 h-20 rounded-full bg-accent hover:bg-accent-dark flex items-center justify-center shadow-lifted text-white tactile-btn voice-halo pointer-events-auto"
          aria-label={language === 'hi' ? 'आवाज से दवा जोड़ें' : 'Voice input — speak to add a medicine'}
        >
          <Mic size={34} strokeWidth={2.2} />
        </button>
        <span className="mt-2 px-3 py-1 rounded-pill bg-accent text-white text-xs font-medium uppercase tracking-wider shadow-soft pointer-events-none">
          {language === 'hi' ? 'आवाज जोड़ें' : 'Voice Add'}
        </span>
      </div>

      {/* ===== Voice modal ===== */}
      {isMicOpen && (
        <div className="fixed inset-0 bg-navy-50/40 backdrop-blur-md z-50 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
          <button
            onClick={() => setIsMicOpen(false)}
            className="absolute top-6 right-6 p-3 text-navy-100 bg-navy-900 rounded-full border border-navy-800 shadow-soft tactile-btn min-tap"
            aria-label="Close voice input"
          >
            <X size={20} />
          </button>

          <div className="mb-10">
            <h2 className="text-2xl font-medium mb-2 text-navy-50">{t.appName} Voice Input</h2>
            <p className="text-navy-100 text-base">
              {activeTab === 'assistant' ? 'Talk to the Pulse Assistant' : t.micPrompt}
            </p>
          </div>

          <div className="relative w-40 h-40 flex items-center justify-center mb-12">
            <div className="absolute inset-0 rounded-full bg-accent/15 animate-ping"></div>
            <div className="absolute inset-4 rounded-full bg-accent/25 animate-pulse"></div>
            <button
              onClick={startSpeechListening}
              className="w-28 h-28 rounded-full bg-accent hover:bg-accent-dark flex items-center justify-center text-white z-10 shadow-lifted tactile-btn"
              aria-label="Start listening"
            >
              {isListening ? <Volume2 size={40} className="animate-bounce" /> : <Mic size={40} />}
            </button>
          </div>

          <div className="bg-navy-900 border border-navy-800 rounded-card p-6 w-full max-w-md shadow-card min-h-24 flex items-center justify-center">
            <p className="text-navy-50 text-base leading-relaxed">{speechText}</p>
          </div>
        </div>
      )}

      {/* ===== Settings drawer (theme, font size, contrast, voice, API keys) ===== */}
      <AccessibilitySettings open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};
