import React from 'react';
import { useMedication } from '../context/MedicationContext';
import { useSettings } from '../context/SettingsContext';
import { jsPDF } from 'jspdf';
import { Flame, AlertCircle, FileText, CheckCircle2, XCircle } from 'lucide-react';

export const AdherenceReport: React.FC = () => {
  const { medications, logs, streak, adherenceRate } = useMedication();
  const { language, t } = useSettings();

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
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Elegant medical header
    doc.setFillColor(11, 19, 43); // deep navy
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(24);
    doc.text("PULSE MEDICATION REPORT", 15, 18);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} | Patient: Self Profile`, 15, 28);

    // Adherence summaries
    doc.setFillColor(248, 250, 252);
    doc.rect(15, 50, 180, 25, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(15, 50, 180, 25);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont('Helvetica', 'bold');
    doc.text("ADHERENCE SUMMARY", 20, 58);
    doc.setFont('Helvetica', 'normal');
    doc.text(`7-Day Adherence Score: ${adherenceRate}%`, 20, 68);
    doc.text(`Current Streak: ${streak} Days`, 120, 68);

    // Active Medications lists
    doc.setFontSize(14);
    doc.setFont('Helvetica', 'bold');
    doc.text("CURRENT PRESCRIBED MEDICATIONS", 15, 90);
    
    let y = 100;
    doc.setFontSize(10);
    
    medications.forEach((med, idx) => {
      doc.setFont('Helvetica', 'bold');
      doc.text(`${idx + 1}. ${med.name} -- ${med.dosage}`, 15, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(`Frequency: ${med.frequency} | Timing: [${med.timing.join(', ')}] | Directions: ${med.instructions}`, 20, y + 5);
      y += 14;
    });

    // Missed doses section
    if (missedDosesList.length > 0) {
      y += 10;
      doc.setFontSize(14);
      doc.setFont('Helvetica', 'bold');
      doc.text("MISSED DOSES RECORD (PAST 7 DAYS)", 15, y);
      
      y += 10;
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(225, 29, 72); // rose red

      missedDosesList.slice(0, 10).forEach((miss) => {
        doc.text(`• ${miss.name} - Missed during ${miss.slot} slot on ${miss.date}`, 15, y);
        y += 7;
      });
    }

    // Save report
    doc.save(`pulse_adherence_report_${new Date().toISOString().split('T')[0]}.pdf`);
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
