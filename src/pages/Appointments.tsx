import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useFirebase } from '../context/FirebaseContext';
import { useRole, useActivePatient } from '../context/RoleContext';
import { useMedication } from '../context/MedicationContext';
import { useSettings } from '../context/SettingsContext';
import { NotificationService } from '../services/notificationService';
import {
  appointmentsPath,
  cancelAppointment,
  createAppointment,
  deleteAppointment,
  markAppointmentComplete,
  parseAppointmentDoc,
  setLinkedDocuments,
  type Appointment,
} from '../services/appointmentService';
import {
  CalendarCheck,
  CalendarPlus,
  Building,
  Clock,
  FileText,
  Bell,
  BellOff,
  CheckCircle2,
  Trash2,
  Link as LinkIcon,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Stethoscope,
  Users,
  Sparkles,
  Save,
} from 'lucide-react';

type FormDraft = {
  doctorName: string;
  specialty: string;
  hospitalName: string;
  date: string;
  time: string;
  notes: string;
  reminderSet: boolean;
};

const emptyDraft = (): FormDraft => ({
  doctorName: '',
  specialty: '',
  hospitalName: '',
  date: '',
  time: '',
  notes: '',
  reminderSet: true,
});

const statusPillStyles = (
  status: 'completed' | 'cancelled' | 'missed'
): string => {
  if (status === 'completed') return 'bg-success/10 border-success/30 text-success';
  if (status === 'cancelled') return 'bg-navy-800 border-navy-700 text-navy-100';
  return 'bg-danger-light border-danger/30 text-danger-dark';
};

export const Appointments: React.FC = () => {
  const { user } = useFirebase();
  const { activePatientName } = useRole();
  const { patientId, isOwnData, isCaregiverViewing } = useActivePatient();
  const { documents } = useMedication();
  const { language } = useSettings();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [draft, setDraft] = useState<FormDraft>(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedDocsFor, setExpandedDocsFor] = useState<string | null>(null);
  const [draftLinks, setDraftLinks] = useState<Record<string, string[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Track which appointment ids we've already scheduled a reminder for,
  // so when the list updates we can cancel removed/updated ones cleanly.
  const scheduledIdsRef = useRef<Set<string>>(new Set());

  /* ===== Localized strings (hi / ta / en) ===== */
  const t = (() => {
    if (language === 'hi') {
      return {
        title: 'अपॉइंटमेंट',
        subtitle: 'आगामी डॉक्टर अपॉइंटमेंट और इतिहास का प्रबंधन करें',
        addBtn: 'अपॉइंटमेंट जोड़ें',
        cancelBtn: 'रद्द करें',
        save: 'सहेजें',
        saving: 'सहेजा जा रहा है…',
        addingFor: 'के लिए जोड़ रहे हैं',
        formTitle: 'नई अपॉइंटमेंट',
        doctor: 'डॉक्टर का नाम',
        specialty: 'विशेषज्ञता',
        hospital: 'अस्पताल / क्लिनिक',
        date: 'तारीख',
        time: 'समय',
        notes: 'नोट्स',
        notesPh: 'कारण, तैयारी, आदि',
        reminder: 'अनुस्मारक — 24 घंटे पहले',
        upcoming: 'आगामी',
        past: 'पिछले',
        emptyUpcoming: 'कोई आगामी अपॉइंटमेंट नहीं',
        emptyPast: 'अब तक कोई इतिहास नहीं',
        markComplete: 'पूरा हुआ चिह्नित करें',
        linkDocs: 'दस्तावेज़ जोड़ें',
        hideDocs: 'छिपाएँ',
        saveLinks: 'लिंक सहेजें',
        delete: 'हटाएँ',
        confirmDelete: 'इस अपॉइंटमेंट को हटाएँ?',
        confirmCancel: 'इस अपॉइंटमेंट को रद्द करें?',
        statusCompleted: 'पूरा',
        statusCancelled: 'रद्द',
        statusMissed: 'छूटा',
        noDocs: 'कोई दस्तावेज़ अपलोड नहीं किया गया है। पहले Documents टैब में जाकर अपलोड करें।',
        linkedCount: (n: number) => `${n} दस्तावेज़ लिंक`,
        reminderOn: 'अनुस्मारक चालू',
        reminderOff: 'कोई अनुस्मारक नहीं',
        errRequired: 'डॉक्टर का नाम, तारीख और समय आवश्यक है।',
        errPast: 'तारीख / समय भविष्य में होना चाहिए।',
      };
    }
    if (language === 'ta') {
      return {
        title: 'சந்திப்புகள்',
        subtitle: 'வரவிருக்கும் மற்றும் கடந்த சந்திப்புகளை நிர்வகிக்கவும்',
        addBtn: 'சந்திப்பு சேர்',
        cancelBtn: 'ரத்து செய்',
        save: 'சேமி',
        saving: 'சேமிக்கப்படுகிறது…',
        addingFor: 'இவருக்காக சேர்க்கிறது',
        formTitle: 'புதிய சந்திப்பு',
        doctor: 'டாக்டர் பெயர்',
        specialty: 'சிறப்புத்துறை',
        hospital: 'மருத்துவமனை / கிளினிக்',
        date: 'தேதி',
        time: 'நேரம்',
        notes: 'குறிப்புகள்',
        notesPh: 'காரணம், தயாரிப்பு, முதலியன',
        reminder: 'நினைவூட்டல் — 24 மணி நேரம் முன்',
        upcoming: 'வரவிருப்பவை',
        past: 'கடந்தவை',
        emptyUpcoming: 'வரவிருக்கும் சந்திப்புகள் எதுவும் இல்லை',
        emptyPast: 'வரலாறு இன்னும் இல்லை',
        markComplete: 'முடிந்ததாகக் குறிக்கவும்',
        linkDocs: 'ஆவணங்களை இணை',
        hideDocs: 'மறை',
        saveLinks: 'இணைப்புகளைச் சேமி',
        delete: 'நீக்கு',
        confirmDelete: 'இந்த சந்திப்பை நீக்க வேண்டுமா?',
        confirmCancel: 'இந்த சந்திப்பை ரத்து செய்ய வேண்டுமா?',
        statusCompleted: 'முடிந்தது',
        statusCancelled: 'ரத்து',
        statusMissed: 'தவறிய',
        noDocs: 'ஆவணங்கள் இல்லை. முதலில் Documents தாவலில் பதிவேற்றவும்.',
        linkedCount: (n: number) => `${n} ஆவணங்கள் இணைக்கப்பட்டுள்ளன`,
        reminderOn: 'நினைவூட்டல் இயக்கப்பட்டது',
        reminderOff: 'நினைவூட்டல் இல்லை',
        errRequired: 'டாக்டர் பெயர், தேதி மற்றும் நேரம் தேவை.',
        errPast: 'தேதி / நேரம் எதிர்காலத்தில் இருக்க வேண்டும்.',
      };
    }
    return {
      title: 'Appointments',
      subtitle: 'Track upcoming and past doctor appointments',
      addBtn: 'Add Appointment',
      cancelBtn: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      addingFor: 'Adding for',
      formTitle: 'New appointment',
      doctor: 'Doctor name',
      specialty: 'Specialty',
      hospital: 'Hospital / Clinic',
      date: 'Date',
      time: 'Time',
      notes: 'Notes',
      notesPh: 'Reason, preparation, etc.',
      reminder: "Remind me 24 hours before",
      upcoming: 'Upcoming',
      past: 'Past',
      emptyUpcoming: 'No upcoming appointments yet',
      emptyPast: 'No past appointments yet',
      markComplete: 'Mark Complete',
      linkDocs: 'Link Documents',
      hideDocs: 'Hide',
      saveLinks: 'Save links',
      delete: 'Delete',
      confirmDelete: 'Delete this appointment?',
      confirmCancel: 'Cancel this appointment?',
      statusCompleted: 'Completed',
      statusCancelled: 'Cancelled',
      statusMissed: 'Missed',
      noDocs: 'No documents uploaded yet. Add some in the Documents tab first.',
      linkedCount: (n: number) => `${n} document${n === 1 ? '' : 's'} linked`,
      reminderOn: 'Reminder on',
      reminderOff: 'No reminder',
      errRequired: 'Doctor name, date and time are required.',
      errPast: 'The date and time must be in the future.',
    };
  })();

  /* ===== Live subscription ===== */
  useEffect(() => {
    if (!patientId) {
      setAppointments([]);
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    const unsub = onSnapshot(
      query(collection(db, appointmentsPath(patientId))),
      (snap) => {
        const rows: Appointment[] = [];
        snap.forEach((d) => {
          const parsed = parseAppointmentDoc(d);
          if (parsed) rows.push(parsed);
        });
        setAppointments(rows);
        setLoadingList(false);
      },
      (err) => {
        console.error('[Appointments] snapshot failed', err);
        setLoadingList(false);
      }
    );
    return () => unsub();
  }, [patientId]);

  /* ===== Reminder (re)scheduling on list/language change ===== */
  useEffect(() => {
    // Cancel any previously scheduled reminders we owned.
    scheduledIdsRef.current.forEach((id) => {
      NotificationService.cancelAppointmentReminder(id);
    });
    scheduledIdsRef.current.clear();

    const nowMs = Date.now();
    appointments.forEach((apt) => {
      if (
        apt.status === 'upcoming' &&
        apt.reminderSet &&
        apt.appointmentDate.getTime() > nowMs
      ) {
        NotificationService.scheduleAppointmentReminder(
          {
            id: apt.id,
            doctorName: apt.doctorName,
            hospitalName: apt.hospitalName,
            appointmentDate: apt.appointmentDate,
          },
          language
        );
        scheduledIdsRef.current.add(apt.id);
      }
    });

    return () => {
      // Clean up on unmount / patient switch.
      scheduledIdsRef.current.forEach((id) => {
        NotificationService.cancelAppointmentReminder(id);
      });
      scheduledIdsRef.current.clear();
    };
  }, [appointments, language]);

  /* ===== Bucketing ===== */
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const u: Appointment[] = [];
    const p: Appointment[] = [];
    appointments.forEach((a) => {
      if (a.status === 'upcoming' && a.appointmentDate.getTime() >= now) u.push(a);
      else p.push(a);
    });
    u.sort((a, b) => a.appointmentDate.getTime() - b.appointmentDate.getTime());
    p.sort((a, b) => b.appointmentDate.getTime() - a.appointmentDate.getTime());
    return { upcoming: u, past: p };
  }, [appointments]);

  /* ===== Form save ===== */
  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user || !patientId) return;
    setFormError(null);

    if (!draft.doctorName.trim() || !draft.date || !draft.time) {
      setFormError(t.errRequired);
      return;
    }
    const combined = new Date(`${draft.date}T${draft.time}`);
    if (isNaN(combined.getTime())) {
      setFormError(t.errRequired);
      return;
    }
    if (combined.getTime() <= Date.now()) {
      setFormError(t.errPast);
      return;
    }

    setSaving(true);
    try {
      if (draft.reminderSet) {
        try {
          await NotificationService.requestPermission();
        } catch (err) {
          console.warn('Notification permission request failed', err);
        }
      }
      await createAppointment(patientId, user.uid, {
        doctorName: draft.doctorName.trim(),
        specialty: draft.specialty.trim(),
        hospitalName: draft.hospitalName.trim(),
        appointmentDate: combined,
        notes: draft.notes.trim(),
        reminderSet: draft.reminderSet,
      });
      setDraft(emptyDraft());
      setIsFormOpen(false);
    } catch (err: any) {
      console.error('[Appointments] save failed', err);
      setFormError(err?.message || 'Could not save the appointment.');
    } finally {
      setSaving(false);
    }
  };

  /* ===== Per-card actions ===== */
  const handleMarkComplete = async (apt: Appointment) => {
    if (!patientId) return;
    setBusyId(apt.id);
    try {
      await markAppointmentComplete(patientId, apt.id);
      NotificationService.cancelAppointmentReminder(apt.id);
    } catch (err) {
      console.error('mark complete failed', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (apt: Appointment) => {
    if (!patientId) return;
    if (!confirm(t.confirmCancel)) return;
    setBusyId(apt.id);
    try {
      await cancelAppointment(patientId, apt.id);
      NotificationService.cancelAppointmentReminder(apt.id);
    } catch (err) {
      console.error('cancel failed', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (apt: Appointment) => {
    if (!patientId) return;
    if (!confirm(t.confirmDelete)) return;
    setBusyId(apt.id);
    try {
      await deleteAppointment(patientId, apt.id);
      NotificationService.cancelAppointmentReminder(apt.id);
    } catch (err) {
      console.error('delete failed', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveLinks = async (apt: Appointment) => {
    if (!patientId) return;
    const next = draftLinks[apt.id] ?? apt.linkedDocumentIds;
    setBusyId(apt.id);
    try {
      await setLinkedDocuments(patientId, apt.id, next);
      setExpandedDocsFor(null);
      setDraftLinks((prev) => {
        const { [apt.id]: _drop, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      console.error('save links failed', err);
    } finally {
      setBusyId(null);
    }
  };

  const toggleLink = (aptId: string, docId: string, currentLinks: string[]) => {
    setDraftLinks((prev) => {
      const base = prev[aptId] ?? currentLinks;
      const exists = base.includes(docId);
      const next = exists ? base.filter((x) => x !== docId) : [...base, docId];
      return { ...prev, [aptId]: next };
    });
  };

  const toggleDocsPanel = (apt: Appointment) => {
    if (expandedDocsFor === apt.id) {
      setExpandedDocsFor(null);
      setDraftLinks((prev) => {
        const { [apt.id]: _drop, ...rest } = prev;
        return rest;
      });
    } else {
      setExpandedDocsFor(apt.id);
      setDraftLinks((prev) => ({ ...prev, [apt.id]: apt.linkedDocumentIds }));
    }
  };

  /* ===== Render helpers ===== */
  const formatWhen = (d: Date): string => {
    const locale =
      language === 'hi' ? 'hi-IN' : language === 'ta' ? 'ta-IN' : 'en-US';
    return d.toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderCard = (apt: Appointment, opts: { isPast: boolean }) => {
    const isExpanded = expandedDocsFor === apt.id;
    const linksDraft = draftLinks[apt.id] ?? apt.linkedDocumentIds;
    const linkedCount = apt.linkedDocumentIds.length;
    const isMissed =
      apt.status === 'upcoming' && apt.appointmentDate.getTime() < Date.now();
    const pastStatusTone =
      apt.status === 'completed'
        ? 'completed'
        : apt.status === 'cancelled'
        ? 'cancelled'
        : 'missed';

    return (
      <div
        key={apt.id}
        className="card-navy flex flex-col gap-3 transition-colors"
      >
        {/* Top row — doctor + specialty + status pill */}
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-medium text-navy-50 truncate">
                Dr. {apt.doctorName || '—'}
              </h3>
              {apt.specialty && (
                <span className="inline-flex items-center gap-1 bg-accent/10 border border-accent/30 text-accent text-xs font-medium uppercase tracking-widest px-2 py-0.5 rounded-md">
                  <Stethoscope size={11} />
                  {apt.specialty}
                </span>
              )}
            </div>
          </div>
          {opts.isPast && (
            <span
              className={`inline-flex items-center text-xs font-medium uppercase tracking-widest px-2 py-0.5 rounded-md border ${statusPillStyles(pastStatusTone)}`}
            >
              {pastStatusTone === 'completed'
                ? t.statusCompleted
                : pastStatusTone === 'cancelled'
                ? t.statusCancelled
                : t.statusMissed}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-sm font-medium text-navy-100">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building size={13} className="text-navy-700 shrink-0" />
            <span className="truncate">{apt.hospitalName || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock size={13} className="text-navy-700 shrink-0" />
            <span className="truncate">{formatWhen(apt.appointmentDate)}</span>
          </div>
        </div>

        {/* Badges */}
        {(linkedCount > 0 || apt.reminderSet || isMissed) && (
          <div className="flex flex-wrap gap-1.5">
            {linkedCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-navy-950 border border-navy-800 text-navy-100 text-xs font-medium px-2 py-0.5 rounded-md">
                <FileText size={11} className="text-accent" />
                {t.linkedCount(linkedCount)}
              </span>
            )}
            {apt.reminderSet && !opts.isPast ? (
              <span className="inline-flex items-center gap-1 bg-success/10 border border-success/30 text-success text-xs font-medium px-2 py-0.5 rounded-md">
                <Bell size={11} />
                {t.reminderOn}
              </span>
            ) : !apt.reminderSet && !opts.isPast ? (
              <span className="inline-flex items-center gap-1 bg-navy-950 border border-navy-800 text-navy-700 text-xs font-medium px-2 py-0.5 rounded-md">
                <BellOff size={11} />
                {t.reminderOff}
              </span>
            ) : null}
            {isMissed && (
              <span className="inline-flex items-center gap-1 bg-danger-light border border-danger/30 text-danger-dark text-xs font-medium px-2.5 py-1 rounded-pill">
                <AlertTriangle size={11} />
                {t.statusMissed}
              </span>
            )}
          </div>
        )}

        {/* Notes */}
        {apt.notes && (
          <p className="text-xs text-navy-100 leading-relaxed line-clamp-3 whitespace-pre-wrap">
            {apt.notes}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-navy-800">
          {!opts.isPast && (
            <button
              onClick={() => handleMarkComplete(apt)}
              disabled={busyId === apt.id}
              className="inline-flex items-center gap-1.5 bg-success/15 hover:bg-success/25 border border-success/40 text-success font-medium text-xs px-3 rounded-card tactile-btn disabled:opacity-60"
              style={{ minHeight: 48 }}
            >
              {busyId === apt.id ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <CheckCircle2 size={13} />
              )}
              <span>{t.markComplete}</span>
            </button>
          )}
          <button
            onClick={() => toggleDocsPanel(apt)}
            className="inline-flex items-center gap-1.5 bg-navy-900 hover:bg-navy-850 border border-navy-800 hover:border-accent/40 text-navy-100 font-medium text-xs px-3 rounded-card tactile-btn"
            style={{ minHeight: 48 }}
          >
            <LinkIcon size={13} />
            <span>{isExpanded ? t.hideDocs : t.linkDocs}</span>
            {isExpanded ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
          {!opts.isPast && (
            <button
              onClick={() => handleCancel(apt)}
              disabled={busyId === apt.id}
              className="inline-flex items-center gap-1.5 bg-navy-900 hover:bg-navy-850 border border-navy-800 text-navy-100 font-medium text-xs px-3 rounded-card tactile-btn disabled:opacity-60"
              style={{ minHeight: 48 }}
            >
              <X size={13} />
              <span>{t.cancelBtn}</span>
            </button>
          )}
          <button
            onClick={() => handleDelete(apt)}
            disabled={busyId === apt.id}
            className="ml-auto inline-flex items-center gap-1.5 bg-navy-900 hover:bg-danger-light border border-navy-800 hover:border-danger/30 text-navy-700 hover:text-danger-dark font-medium text-sm px-4 rounded-card tactile-btn disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">{t.delete}</span>
          </button>
        </div>

        {/* Link Documents inline panel */}
        {isExpanded && (
          <div className="mt-2 bg-navy-950 border border-navy-800 rounded-card p-3 space-y-2 animate-fade-in">
            {documents.length === 0 ? (
              <p className="text-xs text-navy-700 font-medium leading-relaxed">
                {t.noDocs}
              </p>
            ) : (
              <>
                <div className="max-h-48 overflow-y-auto thin-scroll space-y-1.5 pr-1">
                  {documents.map((d) => {
                    const checked = linksDraft.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        className={`flex items-center gap-2 p-2 rounded-card border cursor-pointer tactile-btn ${
                          checked
                            ? 'bg-accent/10 border-accent/40'
                            : 'bg-navy-900 border-navy-800 hover:border-navy-750'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleLink(apt.id, d.id, apt.linkedDocumentIds)
                          }
                          className="w-4 h-4 accent-accent"
                        />
                        <FileText size={14} className="text-accent shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-navy-50 truncate">
                            {d.name}
                          </div>
                          <div className="text-xs text-navy-700 font-medium uppercase tracking-widest truncate">
                            {d.type} · {d.date}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <button
                  onClick={() => handleSaveLinks(apt)}
                  disabled={busyId === apt.id}
                  className="w-full inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium text-sm px-4 rounded-card shadow-soft tactile-btn disabled:opacity-60"
                  style={{ minHeight: 48 }}
                >
                  {busyId === apt.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Save size={13} />
                  )}
                  <span>{t.saveLinks}</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-medium text-navy-50 flex items-center gap-2">
            <CalendarCheck size={22} className="text-accent" />
            <span>{t.title}</span>
          </h2>
          <p className="text-sm text-navy-700 mt-0.5">{t.subtitle}</p>
        </div>
        <button
          onClick={() => {
            setIsFormOpen((v) => !v);
            setFormError(null);
          }}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium px-5 rounded-card shadow-soft tactile-btn self-start sm:self-auto"
          style={{ minHeight: 48 }}
        >
          {isFormOpen ? <X size={15} /> : <CalendarPlus size={15} />}
          <span className="text-sm">
            {isFormOpen ? t.cancelBtn : t.addBtn}
          </span>
        </button>
      </div>

      {/* Caregiver context strip */}
      {isCaregiverViewing && !isOwnData && (
        <div className="card-navy bg-success/[0.05] border-success/30 flex items-center gap-2 py-3">
          <Users size={14} className="text-success shrink-0" />
          <span className="text-xs text-navy-100">
            <span className="text-xs font-medium uppercase tracking-widest text-success mr-2">
              {t.addingFor}
            </span>
            <span className="font-medium text-navy-50">
              {activePatientName || 'patient'}
            </span>
          </span>
        </div>
      )}

      {/* Inline accordion form */}
      {isFormOpen && (
        <form
          onSubmit={handleSave}
          className="card-navy space-y-4 animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h3 className="text-sm font-medium text-navy-50">{t.formTitle}</h3>
          </div>

          {formError && (
            <div className="flex items-start gap-2 bg-warning-light border border-warning/30 rounded-card p-3 text-sm text-warning-dark font-medium">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                {t.doctor}
              </label>
              <input
                type="text"
                value={draft.doctorName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, doctorName: e.target.value }))
                }
                placeholder="Amit Sharma"
                className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent"
                style={{ minHeight: 48 }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                {t.specialty}
              </label>
              <input
                type="text"
                value={draft.specialty}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, specialty: e.target.value }))
                }
                placeholder="Cardiology"
                className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent"
                style={{ minHeight: 48 }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                {t.hospital}
              </label>
              <input
                type="text"
                value={draft.hospitalName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, hospitalName: e.target.value }))
                }
                placeholder="AIIMS Delhi"
                className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent"
                style={{ minHeight: 48 }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                {t.date}
              </label>
              <input
                type="date"
                value={draft.date}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, date: e.target.value }))
                }
                className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent"
                style={{ minHeight: 48 }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                {t.time}
              </label>
              <input
                type="time"
                value={draft.time}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, time: e.target.value }))
                }
                className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent"
                style={{ minHeight: 48 }}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                {t.notes}
              </label>
              <textarea
                value={draft.notes}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, notes: e.target.value }))
                }
                rows={3}
                placeholder={t.notesPh}
                className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Reminder toggle */}
          <button
            type="button"
            onClick={() =>
              setDraft((p) => ({ ...p, reminderSet: !p.reminderSet }))
            }
            className={`w-full flex items-center justify-between gap-2 px-3 rounded-card border tactile-btn transition-colors ${
              draft.reminderSet
                ? 'bg-accent/10 border-accent/40'
                : 'bg-navy-950 border-navy-800 hover:border-navy-750'
            }`}
            style={{ minHeight: 48 }}
          >
            <span
              className={`inline-flex items-center gap-2 ${draft.reminderSet ? 'text-accent' : 'text-navy-100'}`}
            >
              {draft.reminderSet ? <Bell size={14} /> : <BellOff size={14} />}
              <span className="text-xs font-medium uppercase tracking-wider">
                {t.reminder}
              </span>
            </span>
            <span
              className={`relative inline-block w-9 h-5 rounded-full transition-colors ${
                draft.reminderSet ? 'bg-accent' : 'bg-navy-800'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                  draft.reminderSet ? 'left-4' : 'left-0.5'
                }`}
              />
            </span>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setFormError(null);
              }}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-navy-900 hover:bg-navy-850 border border-navy-800 text-navy-100 font-medium rounded-card tactile-btn"
              style={{ minHeight: 48 }}
            >
              <X size={14} />
              <span className="text-sm">{t.cancelBtn}</span>
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium rounded-card shadow-soft tactile-btn disabled:opacity-60"
              style={{ minHeight: 48 }}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              <span className="text-sm">{saving ? t.saving : t.save}</span>
            </button>
          </div>
        </form>
      )}

      {/* Loading state */}
      {loadingList && (
        <div className="card-navy flex items-center justify-center gap-2 py-10 text-navy-700">
          <Loader2 size={16} className="animate-spin text-accent" />
          <span className="text-sm font-medium">Loading appointments…</span>
        </div>
      )}

      {/* Upcoming section */}
      {!loadingList && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b border-navy-800 pb-2">
            <h3 className="text-sm font-medium uppercase tracking-widest text-navy-100">
              {t.upcoming}
            </h3>
            <span className="text-xs font-medium text-navy-700">
              {upcoming.length}
            </span>
          </div>
          {upcoming.length === 0 ? (
            <div className="card-navy text-center py-8">
              <CalendarCheck size={28} className="mx-auto mb-2 text-navy-700 opacity-50" />
              <p className="text-sm font-medium text-navy-100">{t.emptyUpcoming}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {upcoming.map((a) => renderCard(a, { isPast: false }))}
            </div>
          )}
        </section>
      )}

      {/* Past section */}
      {!loadingList && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b border-navy-800 pb-2">
            <h3 className="text-sm font-medium uppercase tracking-widest text-navy-100">
              {t.past}
            </h3>
            <span className="text-xs font-medium text-navy-700">
              {past.length}
            </span>
          </div>
          {past.length === 0 ? (
            <div className="card-navy text-center py-8">
              <Clock size={28} className="mx-auto mb-2 text-navy-700 opacity-50" />
              <p className="text-sm font-medium text-navy-100">{t.emptyPast}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {past.map((a) => renderCard(a, { isPast: true }))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default Appointments;
