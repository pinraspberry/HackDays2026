import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useMedication } from '../context/MedicationContext';
import { useSettings } from '../context/SettingsContext';
import {
  computeAge,
  useActivePatient,
  useRole,
  type UserProfile,
} from '../context/RoleContext';
import { useFirebase } from '../context/FirebaseContext';
import { db } from '../firebase';
import { jsPDF } from 'jspdf';
import { Flame, AlertCircle, FileText, CheckCircle2, XCircle } from 'lucide-react';

const GENDER_LABEL: Record<NonNullable<UserProfile['gender']>, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Not disclosed',
};

export const AdherenceReport: React.FC = () => {
  const { medications, logs, streak, adherenceRate } = useMedication();
  const { language, t } = useSettings();
  const { profile } = useRole();
  const { user } = useFirebase();
  const { patientId, isCaregiverViewing } = useActivePatient();

  // When a caregiver is viewing a linked patient, the in-memory `profile`
  // belongs to the caregiver — we still want the PDF to be about the
  // patient, so fetch their doc on demand.
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(
    profile ?? null
  );
  useEffect(() => {
    if (!patientId) {
      setActiveProfile(profile ?? null);
      return;
    }
    if (!isCaregiverViewing) {
      setActiveProfile(profile ?? null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `users/${patientId}`));
        if (cancelled) return;
        setActiveProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      } catch (err) {
        console.warn('AdherenceReport: fetch patient profile failed', err);
        if (!cancelled) setActiveProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, isCaregiverViewing, profile]);

  // 1. Calculate 7-day logs details for the SVG bar chart
  const today = new Date();
  const past7DaysData = Array.from({ length: 7 }).map((_, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - idx));
    const dateStr = date.toISOString().split('T')[0];
    const dayLog = logs[dateStr] || {};

    let total = 0;
    let taken = 0;

    // Filter meds active on this day
    const activeMeds = medications.filter(m => m.startDate <= dateStr);
    activeMeds.forEach(m => {
      m.timing.forEach(slot => {
        total++;
        if (dayLog[`${m.id}_${slot}`]?.taken) {
          taken++;
        }
      });
    });

    const percent = total > 0 ? Math.round((taken / total) * 100) : 0;
    const label = date.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', { weekday: 'short' });
    
    return {
      dateStr,
      percent,
      label,
      taken,
      total
    };
  });

  // 2. Identify Missed Doses in the past 7 days
  const missedDosesList: { name: string; date: string; slot: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayLog = logs[dateStr] || {};

    const activeMeds = medications.filter(m => m.startDate <= dateStr);
    activeMeds.forEach(m => {
      m.timing.forEach(slot => {
        const logKey = `${m.id}_${slot}`;
        if (!dayLog[logKey]?.taken) {
          missedDosesList.push({
            name: m.name,
            date: dateStr,
            slot
          });
        }
      });
    });
  }

  // 3. Export PDF using jsPDF
  const exportPDFReport = () => {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Resolve the patient identity for this report. When a caregiver is
    // viewing a linked patient, `activeProfile` is that patient; otherwise
    // it falls back to the signed-in user.
    const patientName =
      activeProfile?.fullName ||
      activeProfile?.displayName ||
      user?.email ||
      'PULSE Patient';
    const age = computeAge(activeProfile?.dateOfBirth);
    const ageText = age != null ? `${age} yrs` : '—';
    const genderText = activeProfile?.gender
      ? GENDER_LABEL[activeProfile.gender]
      : '—';
    const blood = activeProfile?.bloodGroup || '—';
    const heightWeight = [
      activeProfile?.heightCm ? `${activeProfile.heightCm} cm` : null,
      activeProfile?.weightKg ? `${activeProfile.weightKg} kg` : null,
    ]
      .filter(Boolean)
      .join(' / ') || '—';

    // Elegant medical header
    pdf.setFillColor(11, 19, 43); // deep navy
    pdf.rect(0, 0, 210, 40, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('Helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.text('PULSE MEDICATION REPORT', 15, 18);

    pdf.setFont('Helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(
      `Generated on: ${new Date().toLocaleDateString()}  |  Patient: ${patientName}`,
      15,
      28
    );
    pdf.text(
      `Age: ${ageText}  |  Gender: ${genderText}  |  Blood Group: ${blood}`,
      15,
      34
    );

    // ----- Patient profile block -----
    pdf.setFillColor(248, 250, 252);
    pdf.rect(15, 46, 180, 38, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.rect(15, 46, 180, 38);

    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(12);
    pdf.setFont('Helvetica', 'bold');
    pdf.text('PATIENT PROFILE', 20, 54);
    pdf.setFontSize(10);
    pdf.setFont('Helvetica', 'normal');

    const conditionsText = (() => {
      const list = activeProfile?.conditions ?? [];
      const notes = (activeProfile?.conditionsNotes || '').trim();
      const joined = list.length ? list.join(', ') : '';
      if (joined && notes) return `${joined} (${notes})`;
      if (joined) return joined;
      if (notes) return notes;
      return 'None reported';
    })();
    const allergiesText =
      activeProfile?.allergies && activeProfile.allergies.length > 0
        ? activeProfile.allergies.join(', ')
        : 'None reported';
    const ec = activeProfile?.emergencyContact;
    const emergencyText = ec && (ec.name || ec.phone)
      ? `${ec.name || '—'} (${ec.relationship || 'contact'}) — ${ec.phone || '—'}`
      : 'Not provided';
    const phoneText = activeProfile?.phoneNumber || 'Not provided';

    // Word-wrap long fields so they fit inside the 170mm column.
    const writeRow = (label: string, value: string, yPos: number): number => {
      pdf.setFont('Helvetica', 'bold');
      pdf.text(label, 20, yPos);
      pdf.setFont('Helvetica', 'normal');
      const wrapped = pdf.splitTextToSize(value, 130) as string[];
      pdf.text(wrapped, 60, yPos);
      return yPos + Math.max(5, wrapped.length * 5);
    };

    let py = 60;
    py = writeRow('Height / Weight:', heightWeight, py);
    py = writeRow('Phone:', phoneText, py);
    py = writeRow('Conditions:', conditionsText, py);
    py = writeRow('Allergies:', allergiesText, py);
    py = writeRow('Emergency contact:', emergencyText, py);

    // ----- Adherence summary -----
    let y = Math.max(py + 4, 96);
    pdf.setFillColor(248, 250, 252);
    pdf.rect(15, y, 180, 22, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.rect(15, y, 180, 22);

    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(12);
    pdf.setFont('Helvetica', 'bold');
    pdf.text('ADHERENCE SUMMARY', 20, y + 8);
    pdf.setFont('Helvetica', 'normal');
    pdf.text(`7-Day Adherence Score: ${adherenceRate}%`, 20, y + 16);
    pdf.text(`Current Streak: ${streak} Days`, 120, y + 16);
    y += 32;

    // ----- Active medications -----
    pdf.setFontSize(14);
    pdf.setFont('Helvetica', 'bold');
    pdf.text('CURRENT PRESCRIBED MEDICATIONS', 15, y);
    y += 10;
    pdf.setFontSize(10);

    medications.forEach((med, idx) => {
      pdf.setFont('Helvetica', 'bold');
      pdf.text(`${idx + 1}. ${med.name} -- ${med.dosage}`, 15, y);
      pdf.setFont('Helvetica', 'normal');
      pdf.text(
        `Frequency: ${med.frequency} | Timing: [${med.timing.join(', ')}] | Directions: ${med.instructions}`,
        20,
        y + 5
      );
      y += 14;
    });

    // ----- Missed doses -----
    if (missedDosesList.length > 0) {
      y += 6;
      pdf.setFontSize(14);
      pdf.setFont('Helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text('MISSED DOSES RECORD (PAST 7 DAYS)', 15, y);

      y += 8;
      pdf.setFontSize(10);
      pdf.setFont('Helvetica', 'normal');
      pdf.setTextColor(225, 29, 72); // rose red

      missedDosesList.slice(0, 10).forEach((miss) => {
        pdf.text(`• ${miss.name} - Missed during ${miss.slot} slot on ${miss.date}`, 15, y);
        y += 7;
      });
    }

    // Sanitise the filename so a patient with spaces in their name still
    // produces a sensible download.
    const slug = patientName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    pdf.save(`pulse_adherence_${slug || 'patient'}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Header and quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-medium text-navy-50 tracking-tight">{t.reportTitle}</h2>
          <p className="text-base text-navy-700 mt-1.5">
            {language === 'hi'
              ? 'पिछले 7 दिनों का दवाई एडहेरेंस सारांश'
              : 'A 7-day summary of your medication adherence'}
          </p>
        </div>
        <button
          onClick={exportPDFReport}
          className="self-start sm:self-auto flex items-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium px-5 rounded-card shadow-soft text-sm tactile-btn"
          style={{ minHeight: 48 }}
        >
          <FileText size={18} />
          <span>{t.exportPdf}</span>
        </button>
      </div>

      {/* 2. Key stats metrics grids */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-navy flex flex-col items-center justify-center p-6 text-center">
          <span className="text-4xl font-medium text-accent">{adherenceRate}%</span>
          <span className="text-xs text-navy-700 font-medium uppercase tracking-wider mt-2">{t.adherenceRate}</span>
        </div>

        <div className="card-navy flex flex-col items-center justify-center p-6 text-center">
          <span className="text-4xl font-medium text-warning-dark flex items-center justify-center gap-2">
            <Flame size={26} fill="#F0A429" stroke="none" />
            <span>{streak}</span>
          </span>
          <span className="text-xs text-navy-700 font-medium uppercase tracking-wider mt-2">{t.streakText}</span>
        </div>

        <div className="card-navy flex flex-col items-center justify-center p-6 text-center">
          <span className="text-4xl font-medium text-success-dark">{medications.length}</span>
          <span className="text-xs text-navy-700 font-medium uppercase tracking-wider mt-2">
            {language === 'hi' ? 'सक्रिय दवाइयाँ' : 'Active Medicines'}
          </span>
        </div>
      </div>

      {/* 3. SVG 7-Day adherence bar chart (custom & zero dependencies!) */}
      <div className="card-navy text-left space-y-5">
        <h3 className="text-xs font-medium text-navy-700 uppercase tracking-wider">7-Day History Chart</h3>

        <div className="flex items-end justify-between h-48 pt-4 border-b border-navy-800 pb-1 px-2 relative">
          
          {/* Background grid lines */}
          <div className="absolute top-4 left-0 right-0 border-t border-dashed border-navy-800 text-xs text-navy-700 font-medium pr-1 text-right">100%</div>
          <div className="absolute top-24 left-0 right-0 border-t border-dashed border-navy-800 text-xs text-navy-700 font-medium pr-1 text-right">50%</div>

          {past7DaysData.map((day, dIdx) => {
            const barHeight = Math.max((day.percent / 100) * 130, 6);
            return (
              <div key={dIdx} className="flex flex-col items-center flex-1 space-y-3 group z-10">
                <div className="relative w-8 flex justify-center items-end h-36">
                  
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-2 bg-navy-50 text-xs font-medium text-white px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-soft">
                    {day.percent}% ({day.taken}/{day.total})
                  </div>

                  <div 
                    style={{ height: `${barHeight}px` }}
                    className={`w-7 rounded-t-md transition-all duration-500 cursor-pointer ${
                      day.percent >= 80 
                        ? 'bg-success' 
                        : day.percent >= 50 
                        ? 'bg-accent'
                        : 'bg-navy-750'
                    }`}
                  ></div>
                </div>
                
                <span className="text-xs font-medium text-navy-100 uppercase tracking-wider">{day.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Missed doses logs list */}
      <div className="card-navy text-left space-y-5">
        <div className="flex items-center gap-2 text-warning-dark">
          <AlertCircle size={22} />
          <h3 className="text-xs font-medium uppercase tracking-wider">{t.missedDoses}</h3>
        </div>

        <div className="space-y-3">
          {missedDosesList.length === 0 ? (
            <div className="text-center py-6 flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="text-success-dark mb-1" size={32} />
              <p className="text-base text-navy-50 font-medium">Perfect compliance!</p>
              <p className="text-sm text-navy-700">No missed doses identified in the past week.</p>
            </div>
          ) : (
            missedDosesList.slice(0, 5).map((miss, idx) => (
              <div 
                key={idx}
                className="bg-warning-light border border-warning/30 rounded-card py-4 px-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 text-left">
                  <XCircle size={22} className="text-warning-dark shrink-0" />
                  <div>
                    <span className="font-medium text-navy-50 text-base">{miss.name}</span>
                    <p className="text-xs text-warning-dark font-medium uppercase mt-1 tracking-wider">{miss.slot} slot</p>
                  </div>
                </div>

                <span className="text-sm font-medium text-navy-700">{miss.date}</span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};
